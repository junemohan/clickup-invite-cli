import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");
export const PROFILE_DIR = path.join(ROOT_DIR, ".clickup-profile");
export const CLICKUP_APP_URL = "https://app.clickup.com";

/**
 * @param {{ headless?: boolean }} [options]
 */
export async function launchClickUpBrowser(options = {}) {
  const headless = options.headless === true;
  /** @type {import('playwright').LaunchPersistentContextOptions} */
  const base = {
    headless,
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      ...base,
      channel: "chrome",
    });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE_DIR, base);
  }

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn(page) {
  const url = page.url();

  // ClickUp login / SSO / Google OAuth walls
  if (
    /login|signup|sign-in|signin|auth\.clickup|accounts\.google\.com|google\.com\/(?:o\/)?oauth/i.test(
      url
    )
  ) {
    return false;
  }

  const loginUi =
    (await page.getByRole("heading", { name: /log in|sign in|welcome back/i }).count()) > 0 ||
    (await page.getByRole("button", { name: /continue with google|log in with google|sign in with google/i }).count()) >
      0;

  if (loginUi) return false;

  // Logged-in app usually has workspace chrome or settings
  if (/app\.clickup\.com/i.test(url) && !/login/i.test(url)) {
    return true;
  }

  return false;
}

/**
 * @param {import('playwright').Page} page
 */
export async function assertLoggedIn(page) {
  if (await isLoggedIn(page)) return;

  throw new Error(
    [
      "ClickUp session missing or expired (common with Google sign-in).",
      "Re-authenticate, then retry the invite:",
      "",
      "  npm run login",
      "",
      "In the browser: Continue with Google → pick your account → finish 2FA if asked,",
      "wait until you see the ClickUp app, then close the window.",
    ].join("\n")
  );
}

/**
 * If the session expired, keep the headed window open and wait for Google login,
 * then continue — so invite does not hard-fail as a separate step.
 *
 * @param {import('playwright').Page} page
 * @param {{ wait?: boolean, timeoutMs?: number }} [options]
 */
export async function ensureLoggedIn(page, options = {}) {
  const wait = options.wait !== false;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  if (await isLoggedIn(page)) return;

  if (!wait) {
    await assertLoggedIn(page);
    return;
  }

  console.warn("\nClickUp session missing or expired.");
  console.warn("Complete Google sign-in in the open browser window.");
  console.warn("  → Continue with Google → account / 2FA → wait for ClickUp to load");
  console.warn(`Waiting up to ${Math.round(timeoutMs / 60000)} minutes (invite will resume automatically)…\n`);

  // Nudge toward login if we are not already there
  const url = page.url();
  if (!/login|accounts\.google/i.test(url)) {
    await page.goto(`${CLICKUP_APP_URL}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await isLoggedIn(page)) {
        console.log("Session restored — continuing automation.\n");
        return;
      }
    } catch {
      // navigations during Google OAuth can briefly detach the page
    }
    await page.waitForTimeout(2000);
  }

  throw new Error(
    "Timed out waiting for Google/ClickUp login. Run `npm run login` and try again."
  );
}


/**
 * Parse --key value and --key=value from argv.
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      out[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}
