import { chromium } from "playwright";

const url = process.argv[2] || "http://47.82.100.166/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(3000);
const appLen = (await page.locator("#app").innerHTML()).length;
const loginCount = await page.locator(".loginbox input").count();
console.log(JSON.stringify({ url, appLen, loginCount, errors: errors.slice(0, 15) }, null, 2));
await browser.close();
