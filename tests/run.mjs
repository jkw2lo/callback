// End-to-end tests: real Chromium, the real extension, the real page. No network: job sites
// are served from fixtures at their real addresses, and Firebase is replaced by a stand-in.
//
//   node tests/run.mjs
//
// Needs the board served at http://127.0.0.1:8765/callback/ (it starts a server if nothing is
// there) and Playwright (PLAYWRIGHT=path/to/playwright/index.mjs, or a sibling project's copy).
//
// Chrome won't let a script click its native right-click menu, and activeTab is only granted by
// a real click. So the menu's click is dispatched to the extension's own handler, and the test
// copy of the extension has wider host access. Those two things need trying by hand.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RESULTS = join(HERE, "results");
const BOARD = "http://127.0.0.1:8765/callback/";
const pw = process.env.PLAYWRIGHT || resolve(ROOT, "../photobook-studio/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(pw).href);

mkdirSync(RESULTS, { recursive: true });

// ---------- a tiny test harness ----------
let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log("  ok   " + name); }
  else { failures.push(name); console.log("  FAIL " + name + (detail !== undefined ? "\n       got: " + JSON.stringify(detail) : "")); }
}
const eq = (name, got, want) => check(name, got === want, got);
const section = (s) => console.log("\n" + s);

// ---------- serve the board if nothing else is ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
let server = null;
const up = await fetch(BOARD).then((r) => r.ok, () => false);
if (!up) {
  server = createServer((req, res) => {
    let path = new URL(req.url, BOARD).pathname;
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = readFileSync(join(ROOT, "..", path));
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => server.listen(8765, "127.0.0.1", ok));
}

// ---------- job postings, at their real addresses ----------
const LONG = "You will shape the product with a small team, talk to customers every week and ship often. ".repeat(4);
const page = (head, body) => "<!doctype html><html><head>" + head + "</head><body>" + body + "</body></html>";
const ld = (o) => '<script type="application/ld+json">' + JSON.stringify(o) + "</script>";
const FIXTURES = {
  "https://job-boards.greenhouse.io/acme/jobs/1": page(
    "<title>Job Application for Product Designer at Acme</title>" +
    ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "x" }, {
      "@type": "JobPosting", title: "Product Designer",
      hiringOrganization: { "@type": "Organization", name: "Acme Robotics" },
      jobLocationType: "TELECOMMUTE",
      jobLocation: { address: { addressLocality: "New York", addressRegion: "NY", addressCountry: "US" } },
      baseSalary: { currency: "USD", value: { minValue: 140000, maxValue: 175000, unitText: "YEAR" } },
      description: "&lt;p&gt;" + LONG + "&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Own the design system&lt;/li&gt;&lt;li&gt;Run research&lt;/li&gt;&lt;/ul&gt;"
    }] }),
    "<h1>Should not be used</h1><div>Other page text</div>"),
  "https://jobs.lever.co/northwind-labs/abc-123": page(
    "<title>Northwind Labs - Senior Researcher</title>",
    '<div class="posting-headline"><h2>Senior Researcher</h2><div class="posting-categories"><div class="location">Brooklyn, NY</div></div></div>' +
    '<div class="posting-page"><div class="content"><h3>About the role</h3><p>' + LONG + "</p><p>The pay range is $120,000 - $150,000.</p></div></div>" +
    '<footer>Apply <a href="#">now</a></footer>'),
  "https://www.linkedin.com/jobs/search/?currentJobId=999&utm_source=x": page(
    '<title>(3) Staff Engineer | Globex | LinkedIn</title><meta property="og:site_name" content="LinkedIn">',
    '<h1 class="job-details-jobs-unified-top-card__job-title">Staff Engineer</h1>' +
    '<div class="job-details-jobs-unified-top-card__company-name"><a>Globex</a></div>' +
    '<div id="job-details"><p>' + LONG + "</p></div><aside>Jobs you may like, and a great deal of other sidebar text.</aside>"),
  "https://umbrella.wd5.myworkdayjobs.com/External/job/London/Lead_1": page(
    "<title>Lead</title>" + ld({ "@type": "JobPosting", title: "Sales &amp; Partnerships Lead",
      hiringOrganization: { name: "2100 Umbrella UK" }, description: "<p>" + LONG + "The salary is £60,000 to £75,000.</p>" }),
    "<h1>Lead</h1>"),
  "https://careers.initech.example/roles/pm": page(
    '<title>Product Manager</title><meta property="og:site_name" content="Initech">',
    "<nav>Home Careers About</nav><main><h1>Product Manager</h1><p>" + LONG + "</p></main>"),
  "https://careers.selected.example/job": page(
    "<title>Analyst - Selected Co</title>",
    '<h1>Analyst</h1><p id="pick">This highlighted paragraph is the real job description, chosen by hand.</p><main><p>' + LONG + "</p></main>"),
  "https://hostile.example/job": page(
    '<title>x</title><meta property="og:site_name" content="&lt;img src=x onerror=window.__pwned=1&gt;">',
    '<h1>&lt;img src=x onerror="window.__pwned=1"&gt; Engineer</h1><main><p>' + LONG + "</p></main>"),
  "https://careers.embed.example/jobs": page(
    "<title>Careers at Embedco</title>",
    '<h1>Careers</h1><iframe id="f" src="https://job-boards.greenhouse.io/embedco/jobs/7" style="width:100%;height:500px"></iframe>'),
  "https://job-boards.greenhouse.io/embedco/jobs/7": page(
    "<title>Job Application for Support Lead at Embedco</title>",
    '<h1>Support Lead</h1><div class="job__location">Remote</div><div class="job__description"><p>' + LONG + "</p></div>")
};

// A test copy of the extension: see the note at the top
const extCopy = mkdtempSync(join(tmpdir(), "callback-ext-"));
cpSync(join(ROOT, "extension"), extCopy, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extCopy, "manifest.json"), "utf8"));
manifest.host_permissions.push("<all_urls>");
manifest.permissions.push("webNavigation");
writeFileSync(join(extCopy, "manifest.json"), JSON.stringify(manifest));

const profile = mkdtempSync(join(tmpdir(), "callback-profile-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1360, height: 860 },
  permissions: ["clipboard-read", "clipboard-write"],
  args: ["--disable-extensions-except=" + extCopy, "--load-extension=" + extCopy]
});
await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
for (const url of Object.keys(FIXTURES)) {
  await context.route(url, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: FIXTURES[url] }));
}
const errors = [];
context.on("weberror", (e) => errors.push(String(e.error())));

let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent("serviceworker");
await sw.evaluate((url) => chrome.storage.local.set({ boardUrl: url }), BOARD);

// Clicks "Add to Callback" as far as a script can: straight into the extension's handler
async function rightClick(url, extra) {
  await sw.evaluate(async ({ url, extra }) => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
    if (!tab) throw new Error("no tab for " + url);
    let info = { menuItemId: "add", frameId: 0, ...extra };
    if (extra && extra.frameUrl) {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      info.frameId = frames.find((f) => f.url === extra.frameUrl).frameId;
    }
    chrome.contextMenus.onClicked.dispatch(info, tab);
  }, { url, extra: extra || {} });
}
const form = (p, name) => p.locator('#jobForm [name="' + name + '"]').inputValue();
async function captured(url, extra) {
  const job = await context.newPage();
  await job.goto(url);
  const opened = context.waitForEvent("page");
  await rightClick(url, extra);
  const board = await opened;
  await board.waitForSelector("#jobDialog[open]");
  return { job, board };
}

try {
  section("Extension");
  const menuExists = await sw.evaluate(() => new Promise((ok) => chrome.contextMenus.update("add", {}, () => ok(!chrome.runtime.lastError))));
  check("the right-click menu item is registered", menuExists);

  section("Capture: structured data (Greenhouse)");
  let url = "https://job-boards.greenhouse.io/acme/jobs/1";
  let { job, board } = await captured(url);
  eq("company comes from the job data", await form(board, "company"), "Acme Robotics");
  eq("role", await form(board, "title"), "Product Designer");
  eq("location, marked remote", await form(board, "location"), "Remote, New York, NY");
  eq("pay", await form(board, "pay"), "$140,000–$175,000 / year");
  eq("posting link", await form(board, "url"), url);
  let jd = await form(board, "jd");
  check("description has its text, list and no markup", jd.includes("shape the product") && jd.includes("• Own the design system") && !jd.includes("<p>"), jd.slice(0, 200));
  check("nothing is saved until you press Save", await board.evaluate(() => Store.all().length === 0));
  await board.screenshot({ path: join(RESULTS, "capture-form.png") });

  section("Saving a job");
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  const tag = await board.evaluate(() => Store.all()[0].tag);
  check("the job gets a random 6-character tag", /^[a-z2-9]{6}$/.test(tag), tag);
  eq("portfolio link carries the tag", await board.locator("#linkHome").textContent(), "https://jkw2lo.github.io/projects/?for=" + tag);
  eq("resume link carries the tag", await board.locator("#linkResume").textContent(), "https://jkw2lo.github.io/projects/?for=" + tag + "#resume");
  check("the tag doesn't reveal the company", !/acme/i.test(tag));
  await board.locator('[data-copy="home"]').click();
  await board.waitForFunction(() => document.querySelector('[data-copy="home"]').textContent === "Copied");
  eq("Copy puts the link on the clipboard", await board.evaluate(() => navigator.clipboard.readText()), "https://jkw2lo.github.io/projects/?for=" + tag);
  await board.locator("#jobClose").click();
  eq("its card is under Saved", await board.locator('[data-stage="saved"] .card-company').textContent(), "Acme Robotics");
  check("the card says the link hasn't been opened", (await board.locator(".signal.quiet").textContent()).includes("not opened"));
  await job.close();

  section("Capture: no structured data (Lever)");
  url = "https://jobs.lever.co/northwind-labs/abc-123";
  const leverPage = await context.newPage();
  await leverPage.goto(url);
  await rightClick(url);
  await board.waitForSelector("#jobDialog[open]");
  check("uses the board tab that's already open", context.pages().filter((p) => p.url().startsWith(BOARD)).length === 1);
  check("the company heading doesn't end up in the role", (await form(board, "title")) === "Senior Researcher", await form(board, "title"));
  eq("company from the address", await form(board, "company"), "Northwind Labs");
  eq("location", await form(board, "location"), "Brooklyn, NY");
  eq("pay found in the text", await form(board, "pay"), "$120,000–$150,000");
  check("description excludes the footer", (await form(board, "jd")).includes("About the role") && !(await form(board, "jd")).includes("Apply now"));
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();
  await leverPage.close();

  section("Capture: LinkedIn");
  url = "https://www.linkedin.com/jobs/search/?currentJobId=999&utm_source=x";
  const li = await context.newPage();
  await li.goto(url);
  await rightClick(url);
  await board.waitForSelector("#jobDialog[open]");
  eq("role", await form(board, "title"), "Staff Engineer");
  eq("company, not LinkedIn", await form(board, "company"), "Globex");
  check("description excludes the sidebar", !(await form(board, "jd")).includes("Jobs you may like"));
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();

  section("Capture: what real Workday and Lever postings publish");
  url = "https://umbrella.wd5.myworkdayjobs.com/External/job/London/Lead_1";
  const wd = await context.newPage();
  await wd.goto(url);
  await rightClick(url);
  await board.waitForSelector("#jobDialog[open]");
  eq("escaped characters in a role are decoded", await form(board, "title"), "Sales & Partnerships Lead");
  eq("a legal entity's code is dropped from the company", await form(board, "company"), "Umbrella UK");
  eq("pay in other currencies is found", await form(board, "pay"), "£60,000–£75,000");
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();
  await wd.close();

  section("Duplicates");
  const again = "https://www.linkedin.com/jobs/search/?currentJobId=999&utm_source=y";
  await context.route(again, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: FIXTURES[url] }));
  await li.goto(again);
  await rightClick(again);
  await board.waitForSelector("#jobDialog[open]");
  check("warns about the same posting with different tracking", await board.locator("#dupNote").isVisible());
  await board.locator("#jobCancel").click().catch(() => {});
  board.once("dialog", (d) => d.accept());
  await board.locator("#jobCancel").click().catch(() => {});
  await board.waitForFunction(() => !document.getElementById("jobDialog").open);
  await li.close();

  const other = await context.newPage();
  await other.goto("https://careers.initech.example/roles/pm");
  await rightClick("https://careers.initech.example/roles/pm");
  await board.waitForSelector("#jobDialog[open]");
  check("a different posting has no warning", !(await board.locator("#dupNote").isVisible()));
  eq("company from the site's name", await form(board, "company"), "Initech");
  eq("role from the heading", await form(board, "title"), "Product Manager");
  check("description comes from the main block", (await form(board, "jd")).includes("shape the product") && !(await form(board, "jd")).includes("Home Careers"));

  section("A second capture while a new job is unsaved");
  const sel = await context.newPage();
  await sel.goto("https://careers.selected.example/job");
  await sel.evaluate(() => getSelection().selectAllChildren(document.getElementById("pick")));
  await rightClick("https://careers.selected.example/job", { selectionText: "flattened" });
  await board.waitForTimeout(400);
  eq("doesn't replace the job you're reviewing", await form(board, "company"), "Initech");
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();
  await board.waitForSelector("#jobDialog[open]");
  eq("opens next, once that one is done", await form(board, "title"), "Analyst");
  eq("highlighted text is used as the description", await form(board, "jd"), "This highlighted paragraph is the real job description, chosen by hand.");
  eq("company from the page title", await form(board, "company"), "Selected Co");
  await board.evaluate(() => { document.getElementById("jobForm").elements.company.value = ""; document.getElementById("jobForm").elements.title.value = ""; });
  await board.locator("#jobSave").click();
  check("needs at least a company or role", await board.locator("#jobForm [name=company].missing").count() === 1);
  await board.keyboard.press("Escape");
  check("Escape doesn't lose an unsaved job", await board.locator("#jobDialog[open]").count() === 1);
  await board.locator("#jobForm [name=company]").fill("Selected Co");
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();
  await sel.close();
  await other.close();

  section("Capture: a posting embedded in a frame");
  const embed = await context.newPage();
  await embed.goto("https://careers.embed.example/jobs");
  await embed.waitForLoadState("load");
  await rightClick("https://careers.embed.example/jobs", { frameUrl: "https://job-boards.greenhouse.io/embedco/jobs/7" });
  await board.waitForSelector("#jobDialog[open]");
  eq("role from the frame", await form(board, "title"), "Support Lead");
  eq("company from the frame", await form(board, "company"), "Embedco");
  eq("the link is the page you were on", await form(board, "url"), "https://careers.embed.example/jobs");
  check("description from the frame", (await form(board, "jd")).includes("shape the product"));
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();
  await embed.close();

  section("A hostile page");
  const bad = await context.newPage();
  await bad.goto("https://hostile.example/job");
  await rightClick("https://hostile.example/job");
  await board.waitForSelector("#jobDialog[open]");
  await board.locator("#jobSave").click();
  await board.waitForSelector("#linkSection:not([hidden])");
  await board.locator("#jobClose").click();
  await board.waitForTimeout(150);
  check("page text can't run on the board", (await board.evaluate(() => window.__pwned)) === undefined);
  check("it's shown as text", (await board.locator(".card", { hasText: "onerror" }).count()) >= 1);
  await bad.close();

  const typed = await board.evaluate(() => {
    const id = Store.add({ company: "T", url: "javascript:alert(1)" }).id;
    return id;
  });
  await board.locator(`[data-job="${typed}"]`).click();
  check("a javascript: link gets no Open link", !(await board.locator("#urlOpen").isVisible()));
  await board.locator("#jobClose").click();

  section("Moving and editing");
  const acme = board.locator(".card", { hasText: "Acme Robotics" });
  await acme.dragTo(board.locator('[data-stage="applied"]'));
  eq("drag moves a job", await board.evaluate(() => Store.all().find((j) => j.company === "Acme Robotics").stage), "applied");
  await board.locator(".card", { hasText: "Acme Robotics" }).click();
  check("the move is in its history", (await board.locator("#historyLine").textContent()).includes("Applied"));
  await board.locator("#jobForm [name=notes]").fill("Spoke to the recruiter");
  await board.locator("#jobForm [name=followUp]").fill("2020-01-15");
  await board.locator("#jobForm [name=resume]").fill("Resume 20260901");
  await board.locator("#jobClose").click();
  check("a due follow-up is flagged", (await board.locator(".follow.due").count()) === 1);
  check("the summary counts it", (await board.locator("#summary").textContent()).includes("1 follow-up due"));
  eq("the last field typed is saved on Done", await board.evaluate(() => Store.all().find((j) => j.company === "Acme Robotics").resume), "Resume 20260901");
  await board.waitForTimeout(150); // the browser finishes writing it to disk
  await board.reload();
  await board.waitForSelector(".card");
  const saved = await board.evaluate(() => Store.all().find((j) => j.company === "Acme Robotics"));
  eq("edits save without a Save button and survive a reload", saved.notes, "Spoke to the recruiter");
  eq("resume version too", saved.resume, "Resume 20260901");
  eq("the tag never changes", saved.tag, tag);
  await board.locator(".card", { hasText: "Globex" }).click();
  await board.locator("#jobForm [name=notes]").fill("Typed just before leaving");
  await board.evaluate(() => document.dispatchEvent(new Event("visibilitychange")) && 0);
  await board.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  eq("leaving the page saves what you just typed", await board.evaluate(() => Store.all().find((j) => j.company === "Globex").notes), "Typed just before leaving");
  await board.locator("#jobClose").click();
  await board.locator("#search").fill("globex");
  eq("search narrows the board", await board.locator(".card").count(), 1);
  await board.locator("#search").fill("");
  check("no draft is delivered twice", !(await board.locator("#jobDialog[open]").count()));

  section("Deleting and backups");
  const before = await board.evaluate(() => Store.all().length);
  await board.locator(`[data-job="${typed}"]`).click();
  board.once("dialog", (d) => d.accept());
  await board.locator("#jobDelete").click();
  eq("delete removes the card", await board.evaluate(() => Store.all().length), before - 1);
  const tomb = await board.evaluate((id) => Store.raw().find((j) => j.id === id), typed);
  check("a deleted job keeps no details", tomb.deleted === true && tomb.company === "" && tomb.url === "");
  await board.locator("#menuBtn").click();
  const downloading = board.waitForEvent("download");
  await board.locator('[data-menu="backup"]').click();
  const file = await (await downloading).path();
  const backup = JSON.parse(readFileSync(file, "utf8"));
  check("backup has every job", backup.app === "callback" && backup.jobs.filter((j) => !j.deleted).length === before - 1);
  backup.jobs.push({ id: "fromfile1", tag: "zzzzzz", company: "From Backup", stage: "offer", updatedAt: 5, createdAt: 5, history: [] }, { id: "bad id!", company: "nope" });
  const restore = join(tmpdir(), "callback-restore-" + Date.now() + ".json");
  writeFileSync(restore, JSON.stringify(backup));
  await board.locator("#restoreFile").setInputFiles(restore);
  await board.waitForFunction(() => /Restored/.test(document.getElementById("restoreNote").textContent));
  eq("restore adds what's new and rejects bad records", await board.locator("#restoreNote").textContent(), "Restored 1 job.");
  await board.locator("#menuClose").click();
  rmSync(restore);

  section("Screens");
  const shots = await context.newPage();
  await board.bringToFront();
  await board.screenshot({ path: join(RESULTS, "board.png") });
  for (const [name, w, h] of [["phone", 390, 800], ["tablet", 800, 1000], ["wide", 1600, 900]]) {
    await board.setViewportSize({ width: w, height: h });
    await board.waitForTimeout(80);
    const over = await board.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check("no sideways page scroll at " + w + "px", over <= 0, over);
    await board.screenshot({ path: join(RESULTS, name + ".png") });
  }
  await board.setViewportSize({ width: 390, height: 800 });
  await board.locator('[data-tab="applied"]').click();
  eq("a phone shows one stage at a time", await board.locator(".column:visible").count(), 1);
  check("and it's the one you picked", await board.locator('.column.active[data-stage="applied"]').isVisible());
  await board.locator(".card:visible").first().click();
  await board.waitForTimeout(80);
  await board.screenshot({ path: join(RESULTS, "phone-job.png") });
  const formOver = await board.evaluate(() => { const d = document.getElementById("jobDialog"); return d.scrollWidth - d.clientWidth; });
  check("the job form fits a phone", formOver <= 0, formOver);
  await board.locator("#jobForm [name=stage]").selectOption("interviewing");
  await board.locator("#jobClose").click();
  eq("the form changes stage on a phone", await board.evaluate(() => Store.all().find((j) => j.company === "Acme Robotics").stage), "interviewing");
  await board.setViewportSize({ width: 1360, height: 860 });
  await shots.close();
  await board.close();

  section("First visit");
  await context.addCookies([]);
  const clean = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "callback-empty-")), { channel: "chromium", headless: true, viewport: { width: 1360, height: 860 } });
  await clean.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const first = await clean.newPage();
  await first.goto(BOARD);
  await first.waitForSelector(".welcome");
  check("shows how to start", (await first.locator(".welcome").textContent()).includes("Save your first job"));
  check("offers to set up the extension when it isn't installed", await first.locator('.welcome [data-act="menu"]').isVisible());
  await first.screenshot({ path: join(RESULTS, "welcome.png") });
  await first.emulateMedia({ colorScheme: "dark" });
  await first.screenshot({ path: join(RESULTS, "welcome-dark.png") });
  await first.emulateMedia({ colorScheme: "light" });

  section("Downloading the extension");
  await first.locator('.welcome [data-act="menu"]').click();
  await first.screenshot({ path: join(RESULTS, "setup.png") });
  const fetching = first.waitForEvent("download");
  await first.locator('#menuBody a[download]').click();
  const download = await fetching;
  eq("the setup steps download the zip", download.suggestedFilename(), "callback-extension.zip");
  const zipPath = await download.path();
  const extDir = join(ROOT, "extension");
  const files = readdirSync(extDir, { recursive: true }).filter((f) => statSync(join(extDir, f)).isFile() && !f.endsWith(".DS_Store"));
  const differs = files.filter((f) => {
    try { return !execFileSync("unzip", ["-p", zipPath, "callback-extension/" + f], { maxBuffer: 1 << 24 }).equals(readFileSync(join(extDir, f))); }
    catch (e) { return true; }
  });
  check("the zip matches extension/ (if not, run tools/package-extension.sh)", files.includes("manifest.json") && !differs.length, differs);
  await first.locator("#menuClose").click();

  section("Sync and visits (Firebase stand-in)");
  // Installed before the page's scripts, so Sync uses it instead of downloading the SDK
  const stub = () => {
    const fs = window.__fs = {
      jobs: JSON.parse(sessionStorage.getItem("__jobs") || "{}"), writes: 0, deny: sessionStorage.getItem("__deny") === "1", listeners: [],
      visits: [["pf-aaaaaa", 3], ["pf-aaaaaa", 2], ["rv-aaaaaa", 1], ["rd-aaaaaa", 1], ["pf-notmine", 1], ["pf", 1], ["pp-writers", 1]]
    };
    const user = { uid: "u1", email: "owner@example.com" };
    const authListeners = [];
    const auth = {
      onAuthStateChanged(fn) { authListeners.push(fn); setTimeout(() => fn(sessionStorage.getItem("__in") ? user : null)); },
      signInWithPopup() { sessionStorage.setItem("__in", "1"); authListeners.forEach((f) => f(user)); return Promise.resolve(); },
      signOut() { sessionStorage.removeItem("__in"); authListeners.forEach((f) => f(null)); return Promise.resolve(); }
    };
    const denied = () => Object.assign(new Error("no"), { code: "permission-denied" });
    const snapshot = () => ({ docs: Object.keys(fs.jobs).map((id) => ({ id, data: () => fs.jobs[id] })) });
    const fire = () => fs.listeners.forEach((l) => l(snapshot()));
    fs.remote = (job) => { fs.jobs[job.id] = job; fire(); };
    const jobs = {
      onSnapshot(ok, no) { if (fs.deny) { setTimeout(() => no(denied())); return () => {}; } fs.listeners.push(ok); setTimeout(() => ok(snapshot())); return () => {}; },
      doc: (id) => ({ set(j) { if (fs.deny) return Promise.reject(denied()); fs.writes++; fs.jobs[id] = JSON.parse(JSON.stringify(j)); sessionStorage.setItem("__jobs", JSON.stringify(fs.jobs)); return Promise.resolve(); } })
    };
    const db = {
      collection(name) {
        if (name === "jobhunt") return { doc: () => ({ collection: () => jobs }) };
        return { orderBy: () => ({ limit: () => ({ get: () => Promise.resolve({ docs: fs.visits.map(([k, days]) => ({ data: () => ({ k, at: { toMillis: () => Date.now() - days * 864e5 } }) })) }) }) }) };
      }
    };
    const firebase = { apps: [], initializeApp() { this.apps.push(1); }, auth: () => auth, firestore: () => db };
    firebase.auth.GoogleAuthProvider = function () {};
    window.firebase = firebase;
  };
  await first.addInitScript(stub);
  await first.reload();
  await first.waitForSelector(".welcome");
  check("signed out, the SDK isn't touched", await first.evaluate(() => window.firebase.apps.length === 0));
  await first.evaluate(() => {
    const j = Store.add({ company: "Local Only", stage: "applied" });
    return j;
  });
  await first.evaluate(() => Store.update(Store.all()[0].id, { stage: "applied" }));
  // give this job the tag the stand-in has visits for
  await first.evaluate(() => Store.merge([Object.assign({}, Store.all()[0], { tag: "aaaaaa", updatedAt: Date.now() + 1000 })]));
  await first.locator("#menuBtn").click();
  await first.locator('[data-menu="signin"]').click();
  await first.waitForFunction(() => Sync.state.status === "in" && Sync.state.views === "ok");
  check("work done while signed out goes up on sign-in", await first.evaluate(() => Object.values(__fs.jobs).some((j) => j.company === "Local Only")));
  check("the menu shows who's signed in", (await first.locator("#menuBody").textContent()).includes("owner@example.com"));
  await first.locator("#menuClose").click();
  const signal = await first.locator(".signal").textContent();
  check("the card counts visits, resume views and downloads", signal.includes("Opened 2×") && signal.includes("resume 1×") && signal.includes("downloaded 1×"), signal);
  check("the summary mentions it", (await first.locator("#summary").textContent()).includes("1 opened your link"));
  check("visits for other links are ignored", await first.evaluate(() => Sync.viewsFor("notmine") === null));
  eq("your own visits stop counting once you're signed in", await first.evaluate(() => localStorage.getItem("projects:me")), "1");
  await first.locator(".card").click();
  check("the job form spells it out", (await first.locator("#viewsLine").textContent()).startsWith("Portfolio opened 2 times, resume viewed once, resume downloaded once."), await first.locator("#viewsLine").textContent());
  await first.locator("#jobForm [name=notes]").fill("Edited");
  await first.locator("#jobClose").click();
  check("an edit goes up", await first.evaluate(() => Object.values(__fs.jobs)[0].notes === "Edited"));
  await first.evaluate(() => __fs.remote(Object.assign({}, Object.values(__fs.jobs)[0], { company: "Renamed Elsewhere", updatedAt: Date.now() + 5000 })));
  await first.waitForSelector(".card:has-text('Renamed Elsewhere')");
  check("a change from another device appears", true);
  const stale = await first.evaluate(() => {
    const j = Object.values(__fs.jobs)[0];
    __fs.remote(Object.assign({}, j, { company: "Older", updatedAt: 1 }));
    return Store.all()[0].company;
  });
  eq("an older copy doesn't overwrite a newer one", stale, "Renamed Elsewhere");
  await first.waitForFunction(() => Object.values(__fs.jobs)[0].company === "Renamed Elsewhere");
  check("and the newer copy goes back up", true);
  await first.evaluate(() => {
    const j = Object.values(__fs.jobs)[0];
    __fs.remote(Object.assign({}, j, { deleted: true, company: "", updatedAt: Date.now() + 9000 }));
  });
  await first.waitForSelector(".welcome");
  check("a deletion from another device arrives", true);

  // The Firestore rule hasn't been added yet
  await first.evaluate(() => { sessionStorage.setItem("__deny", "1"); sessionStorage.setItem("__jobs", "{}"); });
  await first.reload();
  await first.waitForFunction(() => Sync.state.status === "denied");
  check("a missing rule shows a banner, not a failure", (await first.locator("#banner").textContent()).includes("Your jobs are safe"));
  await first.locator("#banner [data-act]").click();
  check("settings show the rule to paste", (await first.locator(".rule").textContent()).includes("match /jobhunt/{uid}/{document=**}"));
  await first.screenshot({ path: join(RESULTS, "settings-denied.png") });
  await first.locator('[data-menu="signout"]').click();
  await first.waitForFunction(() => Sync.state.status === "out");
  check("signing out returns to the sign-in button", await first.locator('[data-menu="signin"]').isVisible());
  await clean.close();

  check("no script errors on any page", errors.length === 0, errors);
} catch (e) {
  failures.push("crashed: " + e.message);
  console.log("\nCRASHED: " + e.stack);
  for (const p of context.pages()) {
    if (p.url().startsWith(BOARD)) await p.screenshot({ path: join(RESULTS, "crash.png") }).catch(() => {});
  }
} finally {
  await context.close().catch(() => {});
  if (server) server.close();
  rmSync(extCopy, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}

console.log("\n" + passed + " passed, " + failures.length + " failed");
if (failures.length) { failures.forEach((f) => console.log(" - " + f)); process.exitCode = 1; }
