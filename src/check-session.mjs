import {
  launchClickUpBrowser,
  isLoggedIn,
  CLICKUP_APP_URL,
} from "./browser.mjs";

/**
 * Exit 0 if the saved profile is still logged into ClickUp; exit 1 if expired.
 * Useful for schedulers / preflight before unattended invites.
 */
async function main() {
  const { context, page } = await launchClickUpBrowser({ headless: true });
  try {
    await page.goto(CLICKUP_APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const ok = await isLoggedIn(page);
    if (ok) {
      console.log("Session OK — logged into ClickUp.");
      process.exitCode = 0;
    } else {
      console.error("Session expired — run: npm run login");
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
