import fs from "node:fs";
import path from "node:path";
import {
  launchClickUpBrowser,
  ensureLoggedIn,
  parseArgs,
  CLICKUP_APP_URL,
  ROOT_DIR,
} from "./browser.mjs";
import { loadConfig, resolveTeamId, resolveWorkspaceName } from "./config.mjs";

const DEBUG_DIR = path.join(ROOT_DIR, "debug");

/**
 * @param {string} teamId
 */
function peopleUrl(teamId) {
  return `${CLICKUP_APP_URL}/${teamId}/settings/team/${teamId}/users`;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} name
 * @param {boolean} enabled
 */
async function debugShot(page, name, enabled) {
  if (!enabled) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const file = path.join(DEBUG_DIR, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Debug screenshot: ${file}`);
}

/**
 * @param {import('playwright').Page} page
 */
async function dismissOverlays(page) {
  const remind = page.getByRole("button", { name: /remind me/i });
  if (await remind.isVisible({ timeout: 1200 }).catch(() => false)) {
    await remind.click().catch(() => {});
  }
  // Hide promo cards that can sit on top of the modal
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll(
        '[class*="intercom"], [class*="product-fruits"], [class*="nudge"]'
      )) {
        /** @type {HTMLElement} */ (el).style.display = "none";
      }
    })
    .catch(() => {});
}

/**
 * @param {import('playwright').Page} page
 * @param {string} teamId
 * @param {boolean} debug
 * @param {{ waitLogin?: boolean }} [opts]
 */
async function openManagePeople(page, teamId, debug, opts = {}) {
  const url = peopleUrl(teamId);
  console.log(`Opening Manage people: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Headed runs: wait for Google re-login in-place instead of aborting
  await ensureLoggedIn(page, {
    wait: opts.waitLogin !== false,
    timeoutMs: 10 * 60 * 1000,
  });

  // After re-login, land back on Manage people
  if (!page.url().includes("/settings/team/")) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
  }

  await dismissOverlays(page);

  const heading = page.getByRole("heading", { name: /manage people/i });
  const inviteBtn = page.getByRole("button", { name: /\+?\s*invite people/i });

  if (
    !(await heading.isVisible({ timeout: 10000 }).catch(() => false)) &&
    !(await inviteBtn.first().isVisible({ timeout: 2000 }).catch(() => false))
  ) {
    await debugShot(page, "not-manage-people", debug);
    throw new Error(
      `Did not land on Manage people. Check login and --team-id (tried ${url}).`
    );
  }

  console.log("Manage people page ready");
}

/**
 * @param {import('playwright').Page} page
 * @param {boolean} debug
 */
async function openInviteModal(page, debug) {
  await dismissOverlays(page);
  await page.waitForTimeout(1000);

  // The white header button sits next to "Export" — avoid the in-table "+ Invite people" row.
  const exportBtn = page.getByRole("button", { name: /^export$/i });
  /** @type {import('playwright').Locator | null} */
  let btn = null;

  if (await exportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    const nearExport = exportBtn.locator("xpath=preceding-sibling::*[1]|following-sibling::*[1]");
    const siblingInvite = page
      .locator("button, [role='button'], a")
      .filter({ hasText: /^\+?\s*Invite people$/i });

    // Prefer a compact header control near Export (not the full-width table row)
    const count = await siblingInvite.count();
    console.log(`Found ${count} "Invite people" control(s)`);
    for (let i = 0; i < count; i++) {
      const candidate = siblingInvite.nth(i);
      const box = await candidate.boundingBox().catch(() => null);
      if (!box) continue;
      // Header button is short; table row is very wide
      if (box.width < 280 && box.y < 280) {
        btn = candidate;
        break;
      }
    }
    if (!btn && count > 0) {
      // Pick the topmost Invite people control
      /** @type {{ loc: import('playwright').Locator, y: number, w: number }[]} */
      const ranked = [];
      for (let i = 0; i < count; i++) {
        const loc = siblingInvite.nth(i);
        const box = await loc.boundingBox().catch(() => null);
        if (box) ranked.push({ loc, y: box.y, w: box.width });
      }
      ranked.sort((a, b) => a.y - b.y || a.w - b.w);
      btn = ranked[0]?.loc ?? null;
    }
    void nearExport;
  }

  if (!btn) {
    btn = page.getByRole("button", { name: /invite people/i }).first();
  }

  if (!(await btn.isVisible({ timeout: 8000 }).catch(() => false))) {
    await debugShot(page, "no-invite-people-btn", debug);
    throw new Error('Could not find "+ Invite people" on Manage people.');
  }

  const box = await btn.boundingBox();
  console.log(
    `Clicking "+ Invite people"${box ? ` at (${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)}) ${Math.round(box.width)}x${Math.round(box.height)}` : ""}…`
  );

  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: true, timeout: 5000 });

  let opened = await page
    .getByText(/invite people for free/i)
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!opened && box) {
    console.log("Modal not open — mouse.click retry…");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    opened = await page
      .getByText(/invite people for free/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
  }

  if (!opened) {
    await debugShot(page, "modal-missing", debug);
    if (debug) {
      const labels = await page.getByRole("button").allTextContents().catch(() => []);
      console.log(
        "Visible buttons:",
        labels.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40)
      );
    }
    throw new Error('Invite modal ("Invite people for free") did not open.');
  }

  const modal = page
    .locator('[role="dialog"], [class*="modal"], [class*="Modal"]')
    .filter({ hasText: /invite people for free/i })
    .first();

  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Invite modal open");
    return modal;
  }

  console.log("Invite modal title visible (using page scope)");
  return page.locator("body");
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} _modal
 * @param {string} email
 * @param {boolean} debug
 */
async function sendInvite(page, _modal, email, debug) {
  await debugShot(page, "modal-open", debug);

  // ClickUp Angular modal: prefer exact placeholder inside the open modal shell
  const modalShell = page.locator(
    "cu-modal-keeper .cu-modal__inner, [data-test='modal__background'], .cu-modal__inner, [role='dialog']"
  ).filter({ hasText: /invite people for free/i });

  const emailField = page
    .locator('input[placeholder="Email, comma or space separated"]')
    .or(
      modalShell.getByPlaceholder(/email,\s*comma or space separated/i)
    )
    .or(modalShell.locator('input:not([data-test="team-users-settings__input-by-name-email"])'))
    .first();

  if (!(await emailField.isVisible({ timeout: 8000 }).catch(() => false))) {
    await debugShot(page, "no-email-field", debug);
    throw new Error('Modal email field ("Email, comma or space separated") not found.');
  }

  await emailField.click({ force: true });
  await emailField.fill("");
  await emailField.pressSequentially(email, { delay: 15 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  const inField = await emailField.inputValue().catch(() => "");
  const chipVisible = await page
    .locator("cu-modal-keeper, .cu-modal__inner, [role='dialog']")
    .getByText(email)
    .isVisible()
    .catch(() => false);

  if (!String(inField).includes(email) && !chipVisible) {
    await emailField.fill(email);
    await page.waitForTimeout(300);
  }

  console.log(`Entered email: ${email}`);
  await debugShot(page, "email-entered", debug);

  const roleBtn = modalShell
    .getByRole("button", { name: /member|admin|guest|limited/i })
    .or(page.locator("cu-modal-keeper").getByRole("button", { name: /member|admin|guest|limited/i }));

  if (await roleBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    const label = ((await roleBtn.first().innerText().catch(() => "")) || "").toLowerCase();
    if (!/\bmember\b/.test(label) || /\badmin\b/.test(label)) {
      await roleBtn.first().click({ force: true });
      await page.waitForTimeout(300);
      const member = page
        .getByRole("option", { name: /^member$/i })
        .or(page.getByRole("menuitem", { name: /^member$/i }))
        .or(page.locator('[role="option"], [role="menuitem"]').filter({ hasText: /^member$/i }));
      await member.first().click({ force: true, timeout: 4000 });
      console.log("Selected Member");
    } else {
      console.log("Role already Member");
    }
  }

  const sendBtn = page
    .locator("cu-modal-keeper, .cu-modal__inner, [role='dialog']")
    .getByRole("button", { name: /send free invite|send invite/i })
    .or(page.getByRole("button", { name: /send free invite/i }));

  if (!(await sendBtn.first().isVisible({ timeout: 5000 }).catch(() => false))) {
    await debugShot(page, "no-send-btn", debug);
    throw new Error('Could not find "Send free invite".');
  }

  if (await sendBtn.first().isDisabled().catch(() => false)) {
    console.log("Send button disabled — pressing Enter on email field…");
    await emailField.click({ force: true });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
  }

  await sendBtn.first().click({ force: true });
  console.log('Clicked "Send free invite"');
  await page.waitForTimeout(3000);
  await debugShot(page, "after-send", debug);

  const toast = (
    await page
      .locator('[role="alert"], [class*="toast"], [class*="Toast"], [class*="snackbar"]')
      .allTextContents()
      .then((t) => t.join(" "))
      .catch(() => "")
  ).toLowerCase();

  const body = ((await page.locator("body").innerText().catch(() => "")) || "").toLowerCase();

  if (/invitation sent|invite sent|has been invited/i.test(toast + " " + body)) {
    console.log(`Invite sent to ${email} as Member.`);
    return;
  }

  if (/already.*(member|invited)|already on the workspace|already been invited/i.test(toast)) {
    console.warn(`Soft success: ${email} already invited or already a member.`);
    return;
  }

  const modalGone = !(await page.getByText(/invite people for free/i).isVisible().catch(() => false));
  if (modalGone) {
    console.log(`Invite sent to ${email} as Member (modal closed).`);
    return;
  }

  if (await page.getByText(email).first().isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`Invite appears on Manage people for ${email}.`);
    return;
  }

  await debugShot(page, "unconfirmed", debug);
  throw new Error(
    `Invite not confirmed for ${email}. Re-run with --debug and check debug/ screenshots.`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const email = typeof args.email === "string" ? args.email.trim() : "";
  const teamId = resolveTeamId(args, config);
  const workspace = resolveWorkspaceName(args, config);
  const headless = args.headless === true || args.headless === "true";
  const debug = args.debug === true || args.debug === "true";
  const keepOpen = args["keep-open"] === true || args["keep-open"] === "true";
  const waitLogin =
    !(args["no-wait-login"] === true || args["no-wait-login"] === "true") && !headless;

  const usage =
    'Usage: npm run invite -- --email user@example.com --team-id YOUR_TEAM_ID [--workspace "My Workspace"]\n' +
    "Or copy config.example.json → config.json and set teamId there.";

  if (!email) {
    console.error(usage);
    process.exit(1);
  }
  if (!teamId || teamId === "YOUR_TEAM_ID") {
    console.error(
      "Missing team id. Pass --team-id, set CLICKUP_TEAM_ID, or add teamId to config.json.\n" +
        "Find it in the Manage people URL: /app.clickup.com/<TEAM_ID>/settings/team/<TEAM_ID>/users"
    );
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Invalid email: ${email}`);
    process.exit(1);
  }

  const { context, page } = await launchClickUpBrowser({ headless });

  try {
    await openManagePeople(page, teamId, debug, { waitLogin });

    if (workspace) {
      const wsVisible = await page
        .getByText(new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      if (!wsVisible) {
        console.warn(
          `Workspace label "${workspace}" not clearly visible; continuing with team ${teamId}.`
        );
      } else {
        console.log(`Workspace "${workspace}" / team ${teamId}`);
      }
    } else {
      console.log(`Team ${teamId}`);
    }

    const modal = await openInviteModal(page, debug);
    await sendInvite(page, modal, email, debug);

    if (keepOpen) {
      console.log("--keep-open: close the browser window when finished reviewing.");
      await new Promise((resolve) => context.on("close", resolve));
    }
  } catch (err) {
    await debugShot(page, "error", true).catch(() => {});
    throw err;
  } finally {
    if (!keepOpen) {
      await context.close();
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
