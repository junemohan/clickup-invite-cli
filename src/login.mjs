import {
  launchClickUpBrowser,
  isLoggedIn,
  CLICKUP_APP_URL,
  PROFILE_DIR,
} from "./browser.mjs";

async function main() {
  console.log(`Opening ClickUp with saved profile:\n  ${PROFILE_DIR}\n`);
  console.log("If your session expired, sign in again with Google in this window.");
  console.log("Steps:");
  console.log("  1. Click Continue with Google (or Log in)");
  console.log("  2. Choose your Google account / complete 2FA");
  console.log("  3. Wait until the ClickUp app loads (not the login page)");
  console.log("  4. Close the browser window (or press Ctrl+C here)\n");

  const { context, page } = await launchClickUpBrowser({ headless: false });
  await page.goto(CLICKUP_APP_URL, { waitUntil: "domcontentloaded" });

  // Poll until logged in, then remind the user they can close
  const started = Date.now();
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes for Google + 2FA

  while (Date.now() - started < maxWaitMs) {
    if (context.browser() === null && context.pages().length === 0) break;

    try {
      if (await isLoggedIn(page)) {
        console.log("\nLogged into ClickUp — session saved to .clickup-profile/");
        console.log("You can close the browser window now (or leave it open).");
        break;
      }
    } catch {
      // page may navigate during Google OAuth
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!(await isLoggedIn(page).catch(() => false))) {
    console.log(
      "\nStill on a login/Google page. Finish sign-in, then close the window when ClickUp loads."
    );
  }

  await new Promise((resolve) => {
    context.on("close", resolve);
    process.on("SIGINT", async () => {
      await context.close().catch(() => {});
      resolve(undefined);
    });
  });

  console.log("Done. Invite runs will reuse this Google/ClickUp session until it expires again.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
