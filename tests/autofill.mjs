// The side panel and the form script, against forms built like the real portals' forms:
// the markup and the quirks here (labels that aren't linked, dropdowns that only open on key-up,
// controlled inputs, Yes and No buttons) were all copied from live Greenhouse, Lever and Ashby pages.
// Chrome won't let a script open a side panel, so these drive panel.html in a tab.
import { join } from "node:path";

const page = (head, body) => "<!doctype html><html><head><meta charset='utf-8'>" + head + "</head><body>" + body + "</body></html>";

// Behaves like a controlled React input and react-select: state only changes through events,
// the list opens on key-up or typing, closes on blur, and refuses focus from a mouse press.
const QUIRKS = `<script>
window.__state = {}; window.__submitted = false;
document.addEventListener("submit", (e) => { e.preventDefault(); window.__submitted = true; }, true);
document.querySelectorAll("input[data-state]").forEach((el) => {
  el.addEventListener("input", () => { window.__state[el.dataset.state] = el.value; });
});
document.querySelectorAll("[data-select]").forEach((box) => {
  const input = box.querySelector("input");
  const choices = box.dataset.select.split("|");
  let list = null;
  const close = () => { if (list) list.remove(); list = null; input.setAttribute("aria-expanded", "false"); };
  const open = () => {
    close();
    list = document.createElement("div");
    list.id = input.id + "-list";
    list.setAttribute("role", "listbox");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "true");
    choices.filter((c) => c.toLowerCase().includes(input.value.toLowerCase())).forEach((c) => {
      const o = document.createElement("div");
      o.setAttribute("role", "option"); o.tabIndex = -1; o.textContent = c;
      o.addEventListener("mousedown", (e) => e.preventDefault());
      o.addEventListener("click", () => {
        box.querySelector(".single-value").textContent = c; input.value = "";
        window.__state[input.id] = c; close();
      });
      list.append(o);
    });
    box.append(list);
  };
  input.addEventListener("keyup", (e) => { if (e.key === "Escape") close(); else open(); });
  input.addEventListener("blur", close);
});
document.querySelectorAll("[data-listbox]").forEach((b) => {
  b.addEventListener("click", () => {
    if (b.list) { b.list.remove(); b.list = null; b.setAttribute("aria-expanded", "false"); return; }
    const list = b.list = document.createElement("ul"); list.setAttribute("role", "listbox");
    b.dataset.listbox.split("|").forEach((c) => {
      const o = document.createElement("li"); o.setAttribute("role", "option"); o.textContent = c;
      o.addEventListener("click", () => { b.textContent = c; list.remove(); b.list = null; b.setAttribute("aria-expanded", "false"); });
      list.append(o);
    });
    b.after(list); b.setAttribute("aria-expanded", "true");
  });
});
document.querySelectorAll("[data-yesno]").forEach((row) => {
  row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    row.querySelectorAll("button").forEach((x) => x.removeAttribute("aria-pressed"));
    b.setAttribute("aria-pressed", "true");
  }));
});
</script>`;
const select = (id, label, choices) =>
  '<div class="select__container"><label for="' + id + '">' + label + '</label><div data-select="' + choices + '">' +
  '<span class="single-value"></span><input id="' + id + '" role="combobox" aria-expanded="false" autocomplete="off"></div></div>';

export const FORMS = {
  // Greenhouse's shape: linked labels, autocomplete hints, its dropdowns, a tiny validation input
  "https://job-boards.greenhouse.io/acme/jobs/2": page("<title>Job Application for Designer at Acme</title>",
    '<h1>Designer</h1><form action="/never"><h2>Your details</h2>' +
    '<div><label for="first_name">First Name<span>*</span></label><input id="first_name" autocomplete="given-name" data-state="first"></div>' +
    '<div><label for="last_name">Last Name*</label><input id="last_name" autocomplete="family-name" data-state="last"></div>' +
    '<div><label for="email">Email*</label><input id="email" type="text" autocomplete="email"></div>' +
    '<input style="width:1px;height:1px;opacity:0" tabindex="-1" id="proxy">' +
    '<input type="password" id="pw" aria-label="Password" style="width:200px"><input type="hidden" id="csrf" value="x">' +
    '<div><label for="resume">Attach</label><input type="file" id="resume"></div>' +
    '<div><label for="q_site">Portfolio</label><input id="q_site"></div>' +
    '<div><label for="q_why">Why do you want to work at Acme?</label><textarea id="q_why"></textarea></div>' +
    select("q_auth", "Are you legally authorized to work in the United States?", "Yes|No") +
    '<h2>Voluntary Self-Identification</h2>' +
    select("veteran", "Veteran Status", "I am a protected veteran|I am not a protected veteran|I don&#39;t wish to answer") +
    select("gender", "Gender", "Male|Female|Decline To Self Identify") +
    '<button type="submit">Submit application</button></form>' + QUIRKS),

  // Lever's shape: labels wrapping selects, questions as lists of options, one label far above
  "https://jobs.lever.co/northwind/abc-1/apply": page("<title>Northwind - Researcher</title>",
    '<form><ul>' +
    '<li class="application-question"><label><div class="application-label"><div class="text">Full name<span class="required">✱</span></div></div>' +
    '<div class="application-field"><input name="name"><div style="display:none">No location found</div></div></label></li>' +
    '<li class="application-question"><label><div class="application-label">Current location<div style="display:none">No location found</div></div><input name="location"></label></li>' +
    '<li class="application-question"><label><div class="application-label">Current company</div><input name="org"></label></li>' +
    '<li class="application-question"><div class="application-label multiple-select">Pronouns</div><div class="application-field"><ul><div class="wrap"><div class="row">' +
    '<li><label><input type="checkbox" name="pronouns" value="She/her"><span>She/her</span></label></li><li><label><input type="checkbox" name="pronouns" value="They/them"><span>They/them</span></label></li>' +
    '</div></div></ul></div></li>' +
    '<li class="application-question"><label><div class="application-label">What is your location?</div><select name="where"><option value="">Select...</option><option>Canada</option><option>United States</option></select></label></li>' +
    '<li class="application-question custom-question"><div class="application-label full-width"><div class="text">Have you ever been employed by Northwind?<span class="required">✱</span></div></div><div class="application-field"><ul>' +
    '<li><label><input type="radio" name="cards[1]" value="Yes"><span>Yes</span></label></li><li><label><input type="radio" name="cards[1]" value="No"><span>No</span></label></li></ul></div></li>' +
    '<li class="application-question"><label><div class="application-label">How did you hear about this job?</div><input name="heard"></label></li>' +
    // Only asked once you say where you are, as Lever's surveys do
    '<li class="application-question" id="later" style="display:none"><div class="application-label">Are you a veteran?</div><div class="application-field"><ul>' +
    '<li><label><input type="radio" name="vet" value="Yes"><span>Yes</span></label></li><li><label><input type="radio" name="vet" value="No"><span>No</span></label></li></ul></div></li>' +
    '</ul></form><script>document.querySelector("select[name=where]").addEventListener("change", (e) => { document.getElementById("later").style.display = e.target.value === "United States" ? "" : "none"; });</script>'),

  // Ashby's shape: unlinked labels, a description between question and answer, Yes and No buttons
  "https://jobs.ashbyhq.com/globex/xyz/application": page("<title>Globex</title>",
    '<form><div class="fieldEntry"><label class="question-title" for="missing">Are you authorized to work where the job is located?</label><div class="question-description"><p>This helps us plan.</p></div>' +
    '<div data-yesno><button type="button">Yes</button><button type="button">No</button><input type="checkbox" name="u1" style="width:0;height:0;opacity:0"></div></div>' +
    '<fieldset class="fieldEntry"><label class="question-title" for="missing2">Gender</label><div class="question-description"><p>Input gender</p></div>' +
    '<div><input type="radio" id="g1" name="g"><label for="g1">Male</label></div><div><input type="radio" id="g2" name="g"><label for="g2">Female</label></div><div><input type="radio" id="g3" name="g"><label for="g3">Decline to self-identify</label></div></fieldset>' +
    '<div class="fieldEntry"><label class="question-title" for="x">Website</label><input id="x" type="text" placeholder="Type here..."></div>' +
    '</form>' + QUIRKS),

  // Workday's shape: buttons that open lists, numbered sections, separate month and year boxes
  "https://umbrella.wd5.myworkdayjobs.com/External/job/apply": page("<title>Apply</title>",
    '<div data-automation-id="workExperienceSection">' +
    '<h4>Work Experience 1</h4><label for="c1">Company</label><input id="c1"><label for="m1">From</label><input id="m1" placeholder="MM" aria-label="Month"><label for="y1">From year</label><input id="y1" placeholder="YYYY">' +
    '<h4>Work Experience 2</h4><label for="c2">Company</label><input id="c2"><label for="t2">Job Title</label><input id="t2"></div>' +
    '<h4>Education 1</h4><label for="s1">School or University</label><input id="s1">' +
    '<label for="d1">Degree</label><button id="d1" type="button" aria-haspopup="listbox" data-listbox="High School|Bachelor&#39;s Degree|Master&#39;s Degree">Select One</button>' +
    '<label for="st">Country</label><button id="st" type="button" aria-haspopup="listbox" data-listbox="Canada|United States of America">Select One</button>' + QUIRKS),

  // A company's own careers site: no script runs here until you ask
  "https://careers.custom.example/apply": page("<title>Apply</title>", '<form><label for="n">Email</label><input id="n" type="email"></form>'),

  // Text from a page must never become HTML in the panel
  "https://jobs.lever.co/hostile/1/apply": page("<title>x</title>",
    '<form><label for="h">&lt;img src=x onerror="window.__pwned=1"&gt;Email</label><input id="h"><select id="s" aria-label="Pick"><option value="">Select...</option><option>&lt;img src=x onerror="window.__pwned=1"&gt;</option></select></form>'),

  // A dropdown with none of the answers, and a field that throws away what it's given
  "https://jobs.lever.co/picky/1/apply": page("<title>x</title>",
    select("q_school", "School", "Harvard|Yale") + '<label for="z">Email</label><input id="z"><script>document.getElementById("z").addEventListener("input",(e)=>{e.target.value="";});</script>' + QUIRKS),

  // Lever's posting page for the form above, and the page after you submit
  "https://jobs.lever.co/northwind/abc-1": page("<title>Northwind - Senior Researcher</title>",
    '<div class="posting-headline"><h2>Senior Researcher</h2><div class="posting-categories"><div class="location">Brooklyn, NY</div></div></div>' +
    '<div class="posting-page"><div class="content"><p>Northwind is a research group that helps city agencies understand how people move, and this role leads studies end to end.</p>' +
    '<h3>Requirements</h3><ul><li>3+ years of experience with SQL and Python for analysis</li><li>Experience with Kubernetes and Terraform</li></ul></div></div>'),
  "https://jobs.lever.co/northwind/abc-1/thanks": page("<title>Application submitted - Northwind</title>", "<h1>Thanks for applying!</h1><p>We'll be in touch.</p>"),

  // A posting with no form: the Fit tab's report card
  "https://job-boards.greenhouse.io/acme/jobs/9": page("<title>Senior Data Engineer at Acme</title>",
    '<h1>Senior Data Engineer</h1><div class="job__location">Remote (US)</div><div class="job__description">' +
    '<p>Acme builds tools for logistics teams, and we are growing quickly across North America.</p>' +
    '<h3>Requirements</h3><ul>' +
    '<li id="sql">3+ years of experience with SQL and Python</li>' +
    '<li id="k8s">Experience with <b>Kubernetes</b> and Terraform</li>' +
    '<li id="yrs">15+ years leading engineering organizations</li>' +
    '<li id="deg">Bachelor&#39;s degree in computer science or a related field</li></ul>' +
    '<h3>Nice to have</h3><ul><li id="tool">Familiarity with Python data tooling and dashboards</li></ul>' +
    '<h3>Benefits</h3><ul><li id="ben">Health insurance and a generous 401k match for everyone</li></ul>' +
    '<p>The pay range for this role is $150,000 - $180,000 per year.</p>' +
    '<p>We are an equal opportunity employer and value diversity at our company.</p></div>'),

  // A posting embedded from a portal: the form is in a frame
  "https://careers.embedded.example/job": page("<title>Careers</title>", '<h1>Careers</h1><iframe id="f" src="https://job-boards.greenhouse.io/embedded/jobs/1" style="width:100%;height:500px"></iframe>'),
  "https://job-boards.greenhouse.io/embedded/jobs/1": page("<title>Job</title>", '<form><label for="e">Email</label><input id="e"></form>')
};

const RESUME = {
  name: "Testa Example Fake", title: "x", location: "", summary: "A summary.",
  links: [{ label: "LinkedIn", url: "https://linkedin.com/in/testa" }],
  experience: [
    { role: "Lead", org: "Globex", where: "New York", start: "Nov 2024", end: "Present", points: ["Led things", "Shipped things"] },
    { role: "Analyst", org: "Initech", where: "Toronto", start: "Mar 2019", end: "Oct 2024", points: ["Analyzed"] }
  ],
  skills: [{ group: "Tools", items: ["SQL", "Python"] }],
  education: [{ school: "University of Waterloo, Canada", degree: "Bachelor of Computing", start: "Sep 2013", end: "Apr 2018", note: "Computer Science" }]
};

export async function runAutofill({ context, sw, check, eq, section, RESULTS, ROOT }) {
  const extId = new URL(sw.url()).host;
  await context.route("https://jkw2lo.github.io/projects/resume.json", (r) => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(RESUME) }));

  const tabIdFor = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  async function open(url) {
    const form = await context.newPage();
    await form.goto(url);
    await form.waitForTimeout(150);
    const tab = await tabIdFor(url);
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 380, height: 860 });
    panel.on("dialog", (d) => d.accept());
    await panel.goto(`chrome-extension://${extId}/panel.html?tab=${tab}`);
    await panel.waitForFunction(() => window.Panel && Panel.state.access !== "checking");
    return { form, panel };
  }
  const label = (panel) => panel.locator("#fieldLabel").textContent();
  const top = (panel) => panel.locator(".pick.top .pick-value").textContent();
  const onField = (panel, text) => panel.waitForFunction((t) => { const f = Panel.state.field; return f && f.label.includes(t); }, text, { timeout: 5000 });
  const clickTop = (panel) => panel.locator(".pick.top .pick-main").click();
  const startForm = async (panel) => { await panel.waitForSelector("#startBtn"); await panel.locator("#startBtn").click(); };
  const saved = () => sw.evaluate(() => chrome.storage.local.get("profile").then((r) => r.profile));
  const closeAll = async (x) => { await x.panel.close(); await x.form.close(); };

  section("Autofill: reading questions");
  const reader = await open("https://jobs.lever.co/picky/1/apply");
  const R = (f) => reader.panel.evaluate((x) => Match.classify(x).map((k) => k.kind)[0] || "", f);
  // All of these labels are real, from live application forms
  const LABELS = {
    "First Name*": "firstName", "Last Name*": "lastName", "Preferred First Name": "preferredName", "Legal Name": "fullName", "Full name ✱": "fullName",
    "Email*": "email", "Phone Number": "phone", "LinkedIn Profile": "linkedin", "LinkedIn URL": "linkedin", "GitHub URL": "github", "Portfolio URL": "portfolio",
    "Other Website": "website", "Website": "website", "Current company": "company", "Current location": "location", "What is your location?": "location", "Where are you currently located?": "location",
    "What is your current country of residence?": "country", "Country": "country", "How did you hear about this job?": "hearAbout", "When can you start a new role?": "availability",
    "Are you legally authorized to work in the United States for our Company?": "workAuth", "Will you now or in the future require sponsorship for a visa to remain in your current location?": "sponsorship",
    "Have you previously worked at or consulted for GitLab?": "previouslyWorked", "Have you ever been previously employed by Spotify?": "previouslyWorked",
    "Gender": "gender", "What best describes your gender?": "gender", "Race and Ethnicity": "race", "What is your race/ethnicity?:": "race", "Are you Hispanic/Latino?": "hispanic",
    "Veteran Status": "veteran", "Are you a veteran/have you served in the military?": "veteran", "Disability Status": "disability", "I consider myself a member of the LGBTQ+ community. (optional)": "lgbtq",
    "What's the name you'd prefer us to use throughout the interview process?": "preferredName",
    // Company-specific questions shouldn't pretend to match
    "Why do you want to work at Discord?": "", "Why do you want to join Figma?": "", "Tell us about a Data Engineering project you led end to end": "",
    "Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?": "",
    "Are you currently located in the US?": "", "By checking this box, I consent to Discord collecting, storing, and processing my responses": "",
    "This role requires fluency in German and English. Do you speak fluent German and English?": ""
  };
  const wrong = [];
  for (const [text, want] of Object.entries(LABELS)) {
    const got = await R({ label: text });
    if (got !== want) wrong.push(text + " -> " + got + " (wanted " + want + ")");
  }
  check("real questions from live forms are recognized (" + Object.keys(LABELS).length + ")", !wrong.length, wrong);
  eq("in a work section, Title means your job title", await R({ label: "Title", section: "Work Experience 1" }), "jobTitle");
  eq("in an education section, Start date means the school's", await R({ label: "Start Date", section: "Education" }), "eduStart");
  eq("an autocomplete hint beats a vague label", await R({ label: "Enter", autocomplete: "family-name" }), "lastName");

  const C = (kind, text) => reader.panel.evaluate(([k, t]) => Match.choiceOf(k, t), [kind, text]);
  const WORDINGS = [
    ["veteran", "I am not a protected veteran", "no"], ["veteran", "I identify as one or more of the classifications of a protected veteran", "yes"], ["veteran", "I decline to self-identify for protected veteran status", "decline"], ["veteran", "No", "no"],
    ["disability", "No, I do not have a disability and have not had one in the past", "no"], ["disability", "Yes, I have a disability, or have had one in the past", "yes"], ["disability", "I do not want to answer", "decline"],
    ["gender", "Woman", "female"], ["gender", "Male", "male"], ["gender", "Decline To Self Identify", "decline"], ["gender", "Non-binary", "nonbinary"],
    ["race", "White (Not Hispanic or Latino)", "white"], ["race", "Asian (Not Hispanic or Latino)", "asian"], ["race", "Hispanic or Latino", "hispanic"], ["race", "Native Hawaiian or Other Pacific Islander", "pacific"], ["race", "Two or More Races", "two"], ["race", "Prefer not to disclose", "decline"],
    ["hispanic", "Yes", "yes"], ["hispanic", "Decline To Self Identify", "decline"], ["workAuth", "Yes", "yes"], ["sponsorship", "No", "no"], ["previouslyWorked", "Yes - Intern", "yes"]
  ];
  const wrongChoice = [];
  for (const [k, t, want] of WORDINGS) { const got = await C(k, t); if (got !== want) wrongChoice.push(k + ": " + t + " -> " + got); }
  check("different forms' wording maps to the same saved answer (" + WORDINGS.length + ")", !wrongChoice.length, wrongChoice);

  const D = (v, f) => reader.panel.evaluate(([x, y]) => Match.formatDate(x, y).text, [v, f]);
  eq("dates: plain text field", await D("2024-11", { label: "Start" }), "Nov 2024");
  eq("dates: month box", await D("2024-11", { label: "From", placeholder: "MM" }), "11");
  eq("dates: year box", await D("2024-11", { label: "From", placeholder: "YYYY" }), "2024");
  eq("dates: MM/YYYY", await D("2024-03", { label: "From", placeholder: "MM/YYYY" }), "03/2024");
  eq("dates: type=month", await D("2024-03", { label: "From", inputType: "month" }), "2024-03");
  eq("dates: month dropdown", await D("2024-03", { label: "Start date month", options: [{ text: "March" }] }), "March");
  const O = (v, list) => reader.panel.evaluate(([x, y]) => Match.bestOption(x, y.map((t) => ({ text: t }))), [v, list]);
  eq("options: a country with a phone code", await O("United States", ["Canada +1", "United States +1"]), 1);
  eq("options: another name for a country", await O("United States", ["Canada", "United States of America"]), 1);
  eq("options: a degree to its level", await O("Bachelor of Computing", ["High School", "Bachelor's Degree", "Master's Degree"]), 1);
  eq("options: no match stays no match", await O("Harvard", ["Yale", "Princeton"]), -1);
  await closeAll(reader);

  section("Autofill: an empty start");
  const blank = await open("https://job-boards.greenhouse.io/acme/jobs/2");
  check("with nothing saved, it asks for your info first", (await blank.panel.locator("#fillView").textContent()).includes("Add your info first"));
  await blank.panel.screenshot({ path: join(RESULTS, "panel-empty.png") });
  await blank.panel.locator("#fillView .btn.solid").click();
  await blank.panel.locator("#importResume").click();
  await blank.panel.waitForFunction(() => document.getElementById("infoStatus").textContent.startsWith("Added"));
  eq("importing the resume adds its jobs", await blank.panel.evaluate(() => Panel.profile().jobs.length), 2);
  eq("...and splits the name", await blank.panel.evaluate(() => Panel.profile().basics.lastName), "Example Fake");
  eq("...and converts its dates", await blank.panel.evaluate(() => Panel.profile().jobs[1].start), "2019-03");
  check("...and knows a current job", await blank.panel.evaluate(() => Panel.profile().jobs[0].current === true));
  check("...and says what still needs adding", (await blank.panel.locator("#infoStatus").textContent()).includes("email and phone"));
  await blank.panel.locator("#importResume").click();
  await blank.panel.waitForFunction(() => document.getElementById("infoStatus").textContent.startsWith("Added 0"));
  eq("importing again adds nothing twice", await blank.panel.evaluate(() => Panel.profile().jobs.length), 2);

  // Slower than a save, so saves land while you're still typing
  await blank.panel.locator('[data-info="basics.email"]').pressSequentially("testa@example.com", { delay: 90 });
  await blank.panel.locator('[data-info="basics.firstName"]').fill("Testa");
  await blank.panel.locator('details[data-part="links"] summary').click();
  await blank.panel.locator('[data-info="basics.portfolio"]').fill("https://testa.example");
  await blank.panel.locator('details[data-part="self"] summary').click();
  await blank.panel.locator('[data-answer="veteran"]').selectOption("no");
  await blank.panel.waitForTimeout(300);
  await blank.panel.screenshot({ path: join(RESULTS, "panel-info.png"), fullPage: true });
  const stored = await saved();
  eq("your edits save as you type", stored.basics.email, "testa@example.com");
  eq("self-ID answers save", stored.answers.veteran, "no");
  check("self-ID answers start unset, and nothing is assumed", stored.answers.gender === undefined && stored.answers.race === undefined);
  await blank.panel.reload();
  await blank.panel.waitForFunction(() => window.Panel && Panel.profile().basics.email === "testa@example.com");
  check("they're still there after reopening", true);
  await blank.panel.evaluate(() => { document.querySelector("#tabInfo").click(); });
  await blank.panel.locator('[data-info="basics.street"]').fill("1 Test St");
  await blank.panel.close();
  await blank.form.waitForTimeout(150);
  eq("closing right after typing keeps it", (await saved()).basics.street, "1 Test St");
  blank.panel = await context.newPage();
  await closeAll(blank);

  section("Autofill: filling a form");
  const gh = await open("https://job-boards.greenhouse.io/acme/jobs/2");
  check("a known portal needs no setup", await gh.panel.evaluate(() => Panel.state.access === "ok"));
  const before = await gh.form.content();
  check("the page sees none of your info before you click", !before.includes("testa@example.com") && !before.includes("Testa"));
  await startForm(gh.panel);
  await onField(gh.panel, "First Name");
  check("Start goes to the first empty field", true);
  eq("...cleaning the label", await label(gh.panel), "First Name");
  eq("...with your first name on top", await top(gh.panel), "Testa");
  check("...and marks the field on the page", await gh.form.evaluate(() => document.getElementById("first_name").style.outline.includes("solid")));
  await gh.panel.screenshot({ path: join(RESULTS, "panel-field.png") });
  await clickTop(gh.panel);
  await onField(gh.panel, "Last Name");
  eq("a click puts the value in", await gh.form.inputValue("#first_name"), "Testa");
  eq("...in a way a React-style form notices", await gh.form.evaluate(() => window.__state.first), "Testa");
  eq("...and moves on to the next empty field", await label(gh.panel), "Last Name");
  check("...and moves the mark with it", await gh.form.evaluate(() => !document.getElementById("first_name").style.outline && document.getElementById("last_name").style.outline.includes("solid")));

  await gh.panel.locator(".pick.top .pick-main").focus();
  await gh.panel.keyboard.press("Enter");
  await onField(gh.panel, "Email");
  eq("Enter does the same", await gh.form.inputValue("#last_name"), "Example Fake");
  const rowCopy = gh.panel.locator(".pick.top .pick-copy");
  await rowCopy.click();
  await gh.panel.waitForTimeout(100);
  eq("the copy button copies instead", await gh.panel.evaluate(() => navigator.clipboard.readText()), "testa@example.com");
  eq("...without filling", await gh.form.inputValue("#email"), "");
  await clickTop(gh.panel);

  await onField(gh.panel, "Portfolio");
  const fieldNames = await gh.form.evaluate(() => ["pw", "csrf", "resume", "proxy"].map((id) => document.getElementById(id).value));
  check("passwords, hidden fields, file inputs and invisible inputs are skipped", fieldNames.every((v) => v === "" || v === "x") && (await label(gh.panel)) === "Portfolio", fieldNames);
  eq("your portfolio is suggested", await top(gh.panel), "https://testa.example");
  await gh.panel.locator("#nextBtn").click();
  await onField(gh.panel, "Why do you want");
  eq("Next leaves a field alone", await gh.form.inputValue("#q_site"), "");
  check("a company-specific question says nothing fits", (await gh.panel.locator("#suggestions").textContent()).includes("Nothing saved fits"));
  await gh.panel.locator("#backBtn").click();
  await onField(gh.panel, "Portfolio");
  check("Back returns to the last field", true);
  await gh.panel.locator(".search").fill("Globex");
  await gh.panel.waitForSelector("#searchResults .pick");
  check("search finds anything you've saved", (await gh.panel.locator("#searchResults").textContent()).includes("Globex"));
  await gh.panel.locator(".search").fill("");
  await gh.panel.locator("#nextBtn").click();
  await onField(gh.panel, "Why do you want");
  await gh.panel.locator("#nextBtn").click();

  await onField(gh.panel, "legally authorized");
  await gh.panel.waitForFunction(() => Panel.state.field.options.length === 2);
  check("a dropdown's choices are read without you opening it", (await gh.panel.locator("#suggestions").textContent()).includes("This form's choices"));
  eq("...and left closed", await gh.form.getAttribute("#q_auth", "aria-expanded"), "false");
  check("with no saved answer, it doesn't guess", (await gh.panel.locator(".pick.top").count()) === 0);
  await gh.panel.screenshot({ path: join(RESULTS, "panel-choices.png") });
  await gh.panel.locator(".pick-main", { hasText: "Yes" }).click();
  await onField(gh.panel, "Veteran");
  eq("picking a choice fills the dropdown", await gh.form.locator('[data-select] .single-value').first().textContent(), "Yes");
  check("...and offers to remember it", await gh.panel.locator("#rememberNote").isVisible());
  await gh.panel.locator("#rememberYes").click();
  await gh.panel.waitForTimeout(300);
  eq("...as your answer for all forms", (await saved()).answers.workAuth, "yes");

  await gh.panel.waitForFunction(() => Panel.state.field.options.length === 3);
  eq("your saved answer finds this form's wording", await top(gh.panel), "I am not a protected veteran");
  await clickTop(gh.panel);
  await onField(gh.panel, "Gender");
  eq("...and fills it", await gh.form.locator('[data-select] .single-value').nth(1).textContent(), "I am not a protected veteran");
  await gh.panel.waitForFunction(() => Panel.state.field.options.length === 3);
  await gh.panel.locator("#nextBtn").click();
  await gh.panel.waitForSelector("#endCard");
  check("it stops at the end and leaves submitting to you", (await gh.panel.locator("#endCard").textContent()).includes("submit it yourself"));
  check("nothing was submitted", await gh.form.evaluate(() => window.__submitted === false));
  eq("...and the page didn't go anywhere", gh.form.url(), "https://job-boards.greenhouse.io/acme/jobs/2");
  check("the count keeps up", /\d+ of \d+ filled/.test(await gh.panel.locator("#fieldCount").textContent()));

  // Clicking in the page itself
  await gh.form.locator("#first_name").click();
  await onField(gh.panel, "First Name");
  check("clicking a field on the page brings up its suggestions", true);
  const lit = gh.form.locator("#first_name");
  await gh.panel.close();
  await gh.form.waitForFunction(() => !document.getElementById("first_name").style.outline);
  check("closing the panel removes the mark", !(await lit.getAttribute("style") || "").includes("solid"));
  await gh.form.close();

  section("Autofill: other portals' shapes");
  const lv = await open("https://jobs.lever.co/northwind/abc-1/apply");
  await startForm(lv.panel);
  await onField(lv.panel, "Full name");
  eq("Lever: text around a hidden message stays out of the label", await label(lv.panel), "Full name");
  eq("Lever: your full name", await top(lv.panel), "Testa Example Fake");
  await clickTop(lv.panel);
  await onField(lv.panel, "Current location");
  eq("Lever: hidden text in a label is ignored", await label(lv.panel), "Current location");
  await lv.panel.locator("#nextBtn").click();
  await onField(lv.panel, "Current company");
  eq("Lever: current company is your latest job", await top(lv.panel), "Globex");
  await lv.panel.locator("#nextBtn").click();
  await onField(lv.panel, "Pronouns");
  check("Lever: a question labelled far above its options", true);
  await lv.panel.locator(".pick-main", { hasText: "They/them" }).click();
  await lv.form.waitForFunction(() => document.querySelector('input[value="They/them"]').checked);
  eq("Lever: pick-many questions stay put for more picks", await label(lv.panel), "Pronouns");
  await lv.panel.locator("#nextBtn").click();
  await onField(lv.panel, "What is your location");
  check("Lever: the options in a label's select stay out of it", (await label(lv.panel)) === "What is your location?");
  await lv.panel.locator(".pick-main", { hasText: "United States" }).click();
  await onField(lv.panel, "employed by Northwind");
  eq("Lever: a native dropdown fills", await lv.form.inputValue('select[name="where"]'), "United States");
  await lv.panel.locator(".pick-main", { hasText: "No" }).click();
  await onField(lv.panel, "How did you hear");
  check("Lever: a radio fills", await lv.form.evaluate(() => document.querySelector('input[value="No"]').checked));
  // Typing an answer yourself
  await lv.form.locator('input[name="heard"]').fill("A friend");
  await lv.form.locator('input[name="heard"]').press("Tab");
  await lv.panel.waitForSelector("#rememberNote");
  check("an answer you typed can be remembered", (await lv.panel.locator("#rememberNote").textContent()).includes("A friend"));
  await lv.panel.locator("#rememberYes").click();
  await lv.panel.waitForTimeout(300);
  eq("...and goes where it belongs", (await saved()).texts.hearAbout, "A friend");
  await closeAll(lv);

  const ab = await open("https://jobs.ashbyhq.com/globex/xyz/application");
  await startForm(ab.panel);
  await onField(ab.panel, "authorized");
  eq("Ashby: Yes and No buttons get the unlinked question", await label(ab.panel), "Are you authorized to work where the job is located?");
  eq("Ashby: your saved answer", await top(ab.panel), "Yes");
  await clickTop(ab.panel);
  await onField(ab.panel, "Gender");
  check("Ashby: the button is pressed", await ab.form.evaluate(() => document.querySelector("[data-yesno] button").getAttribute("aria-pressed") === "true"));
  eq("Ashby: a description isn't mistaken for the question", await label(ab.panel), "Gender");
  check("Ashby: the hidden checkbox behind the buttons isn't a field", await ab.panel.evaluate(() => Panel.state.frames.get(0).total === 3));
  await closeAll(ab);

  await sw.evaluate(async () => {
    const { profile } = await chrome.storage.local.get("profile");
    profile.saved.push({ q: "Why are you interested in this role?", a: "Because it's interesting." });
    await chrome.storage.local.set({ profile });
  });
  const wd = await open("https://umbrella.wd5.myworkdayjobs.com/External/job/apply");
  await startForm(wd.panel);
  await onField(wd.panel, "Company");
  eq("Workday: the first section offers your first job", await top(wd.panel), "Globex");
  await wd.panel.locator("#nextBtn").click();
  await wd.panel.waitForFunction(() => Panel.state.field.placeholder === "MM");
  eq("Workday: a month box gets the month", await top(wd.panel), "11");
  await clickTop(wd.panel);
  await wd.panel.waitForFunction(() => Panel.state.field.placeholder === "YYYY");
  eq("Workday: a year box gets the year", await top(wd.panel), "2024");
  await clickTop(wd.panel);
  await wd.panel.waitForFunction(() => Panel.state.field.section === "Work Experience 2");
  eq("Workday: section 2 offers your second job first", await top(wd.panel), "Initech");
  await clickTop(wd.panel);
  await onField(wd.panel, "Job Title");
  eq("Workday: the rest of that section follows your pick", await top(wd.panel), "Analyst");
  await clickTop(wd.panel);
  await onField(wd.panel, "School");
  eq("Workday: school", await top(wd.panel), "University of Waterloo, Canada");
  await clickTop(wd.panel);
  await onField(wd.panel, "Degree");
  await wd.panel.waitForFunction(() => Panel.state.field.options.length === 3);
  eq("Workday: a list button's choices are read", await top(wd.panel), "Bachelor's Degree");
  check("...and it closes again", await wd.form.evaluate(() => document.getElementById("d1").getAttribute("aria-expanded") !== "true"));
  await clickTop(wd.panel);
  await onField(wd.panel, "Country");
  eq("Workday: a list button fills", await wd.form.locator("#d1").textContent(), "Bachelor's Degree");
  await closeAll(wd);

  section("Autofill: remembering");
  const learned = await open("https://jobs.lever.co/northwind/abc-1/apply");
  await startForm(learned.panel);
  await onField(learned.panel, "Full name");
  await learned.panel.locator("#nextBtn").click();
  await onField(learned.panel, "Current location");
  await learned.panel.locator("#nextBtn").click();
  await onField(learned.panel, "Current company");
  await learned.panel.locator(".pick-main", { hasText: "Initech" }).click();
  await onField(learned.panel, "Pronouns");
  await learned.form.reload();
  await learned.form.waitForTimeout(150);
  await learned.panel.waitForFunction(() => Panel.state.ports.size > 0);
  await startForm(learned.panel);
  await onField(learned.panel, "Full name");
  await learned.panel.locator("#nextBtn").click();
  await onField(learned.panel, "Current location");
  await learned.panel.locator("#nextBtn").click();
  await onField(learned.panel, "Current company");
  eq("a pick you preferred comes first next time", await top(learned.panel), "Initech");
  await closeAll(learned);

  section("Autofill: filling in one go");
  const all = await open("https://job-boards.greenhouse.io/acme/jobs/2");
  await all.panel.waitForSelector("#fillAll");
  await all.panel.screenshot({ path: join(RESULTS, "panel-start.png") });
  await all.form.fill("#last_name", "Mine");
  await onField(all.panel, "Last Name");
  check("Fill the form is there while you're on a field, too", await all.panel.locator("#fillAllSmall").isVisible());
  await all.panel.locator("#fillAllSmall").click();
  await all.panel.waitForSelector("#doneReview", { timeout: 20000 });
  eq("it fills what it has a clear answer for", await all.form.inputValue("#first_name"), "Testa");
  eq("...so a React-style form notices", await all.form.evaluate(() => window.__state.first), "Testa");
  eq("...including your portfolio", await all.form.inputValue("#q_site"), "https://testa.example");
  const chosen = await all.form.locator("[data-select] .single-value").allTextContents();
  eq("...and dropdowns with a saved answer", chosen.slice(0, 2).join(" | "), "Yes | I am not a protected veteran");
  eq("...but not one you haven't answered", chosen[2], "");
  eq("what you'd already typed is left alone", await all.form.inputValue("#last_name"), "Mine");
  check("passwords and hidden fields stay untouched", (await all.form.inputValue("#pw")) === "" && (await all.form.inputValue("#csrf")) === "x");
  check("nothing is submitted", await all.form.evaluate(() => window.__submitted === false));
  eq("...and the page stays put", all.form.url(), "https://job-boards.greenhouse.io/acme/jobs/2");
  const filledRows = await all.panel.locator("#filledList .rev").allTextContents();
  eq("the review lists what it filled", filledRows.length, 5);
  check("...with each value and where it came from", filledRows.some((t) => t.includes("Email") && t.includes("testa@example.com")), filledRows);
  const leftRows = await all.panel.locator("#leftList .rev").allTextContents();
  check("...and what's left, with why", leftRows.some((t) => t.includes("Why do you want") && t.includes("Nothing saved fits")) && leftRows.some((t) => t.includes("Gender") && t.includes("No saved answer")), leftRows);
  check("what it filled is outlined on the page", await all.form.evaluate(() => document.getElementById("first_name").style.outline.includes("dashed")));
  await all.panel.screenshot({ path: join(RESULTS, "panel-review.png"), fullPage: true });

  await all.panel.locator("#leftList .rev-main", { hasText: "Gender" }).click();
  await onField(all.panel, "Gender");
  check("clicking one opens it, with a way back", await all.panel.locator("#backToReview").isVisible());
  await all.panel.waitForFunction(() => Panel.state.field.options.length === 3);
  await all.panel.locator(".pick-main", { hasText: "Decline To Self Identify" }).click();
  await all.panel.waitForSelector("#reviewCard");
  await all.panel.waitForFunction(() => Panel.state.review.filled.length === 6);
  eq("a pick while reviewing goes back to the list", (await all.form.locator("[data-select] .single-value").allTextContents())[2], "Decline To Self Identify");
  check("...and moves it to the filled list", !(await all.panel.locator("#leftList").textContent()).includes("Gender"));
  await all.panel.locator("#filledList .rev", { hasText: "Email" }).locator(".rev-undo").click();
  await all.panel.waitForFunction(() => document.getElementById("leftList").textContent.includes("You cleared it"));
  eq("Undo empties the field", await all.form.inputValue("#email"), "");
  check("...and drops its outline", await all.form.evaluate(() => !document.getElementById("email").style.outline));
  await all.panel.locator("#filledList .rev-main", { hasText: "First Name" }).click();
  await onField(all.panel, "First Name");
  await all.panel.locator("#backToReview").click();
  await all.panel.waitForSelector("#reviewCard");
  check("Back to review returns to the list", true);
  await all.panel.locator("#doneReview").click();
  await all.panel.waitForSelector("#startCard");
  check("Done removes the outlines", await all.form.evaluate(() => !document.getElementById("first_name").style.outline));
  await closeAll(all);

  await sw.evaluate(async () => {
    const { profile } = await chrome.storage.local.get("profile");
    profile.basics.country = "United States";
    await chrome.storage.local.set({ profile });
  });
  const later = await open("https://jobs.lever.co/northwind/abc-1/apply");
  await later.panel.waitForSelector("#fillAll");
  await later.panel.locator("#fillAll").click();
  await later.panel.waitForSelector("#doneReview", { timeout: 20000 });
  eq("a native dropdown fills in one go", await later.form.inputValue('select[name="where"]'), "United States");
  check("a question that appears after an answer is filled too", await later.form.evaluate(() => document.querySelector('input[name="vet"][value="No"]').checked));
  check("a question with no saved answer is left for you", (await later.panel.locator("#leftList").textContent()).includes("employed by Northwind"));
  await closeAll(later);

  section("Autofill: which job");
  const board = await context.newPage();
  await board.goto("http://127.0.0.1:8765/callback/");
  await board.waitForFunction(() => window.Store && Store.all);
  const tagged = await board.evaluate(() => Store.add({ company: "Northwind", title: "Researcher", url: "https://jobs.lever.co/northwind/abc-1", stage: "saved", notes: "Private note", jd: "Long description" }).tag);
  await sw.evaluate((t) => new Promise((ok) => {
    (function poll() { chrome.storage.local.get("boardJobs").then((r) => ((r.boardJobs || []).some((j) => j.tag === t) ? ok() : setTimeout(poll, 50))); })();
  }), tagged);
  const sent = await sw.evaluate(() => chrome.storage.local.get("boardJobs").then((r) => r.boardJobs));
  const mine = sent.find((j) => j.tag === tagged);
  check("the board tells the extension about a new job", !!mine);
  check("...without notes or the job description", !("notes" in mine) && !("jd" in mine));
  const job = await open("https://jobs.lever.co/northwind/abc-1/apply");
  check("the apply page is matched to the saved posting", (await job.panel.locator("#jobBar").textContent()).includes("Applying to"));
  eq("...and selected", await job.panel.locator("#jobBar select").inputValue(), tagged);
  await startForm(job.panel);
  await onField(job.panel, "Full name");
  const suggestPortfolio = (label) => job.panel.evaluate((l) => Match.suggest({ label: l }, Panel.profile(), { job: Panel.state.jobs.find((j) => j.tag === Panel.state.chosenJob.get(Panel.state.tabId)) || Match.jobForPage(Panel.state.pageUrl, Panel.state.jobs) }).suggestions.map((s) => s.value), label);
  eq("a portfolio question offers that job's tracked link first", (await suggestPortfolio("Portfolio URL"))[0], "https://jkw2lo.github.io/projects/?for=" + tagged);
  check("...then your plain one", (await suggestPortfolio("Portfolio URL")).includes("https://testa.example"));
  await job.panel.locator("#jobBar select").selectOption("");
  await job.panel.waitForFunction(() => !document.getElementById("jobBar").textContent.includes("Applying to"));
  check("you can say it's none of these", (await job.panel.locator("#jobBar").textContent()).includes("Add this job"));
  await closeAll(job);
  const other = await open("https://jobs.lever.co/picky/1/apply");
  check("a different company's form isn't matched", (await other.panel.locator("#jobBar").textContent()).includes("Not matched"));
  await closeAll(other);
  await board.evaluate((t) => Store.remove(Store.all().find((j) => j.tag === t).id), tagged);
  await board.close();

  const adding = await open("https://job-boards.greenhouse.io/acme/jobs/2");
  const boardOpens = context.waitForEvent("page");
  await adding.panel.locator("#addJob").click();
  const review = await boardOpens;
  await review.waitForSelector("#jobDialog[open]");
  eq("Add this job opens the board with the page's address", await review.locator('#jobForm [name="url"]').inputValue(), "https://job-boards.greenhouse.io/acme/jobs/2");
  await review.close();
  await closeAll(adding);

  section("Autofill: when a field won't cooperate");
  const picky = await open("https://jobs.lever.co/picky/1/apply");
  await startForm(picky.panel);
  await onField(picky.panel, "School");
  await picky.panel.waitForFunction(() => Panel.state.field.options.length === 2);
  eq("a value that isn't one of the choices isn't offered as if it were", await picky.panel.locator(".pick.top").count(), 0);
  await picky.panel.locator(".search").fill("Waterloo");
  await picky.panel.waitForSelector("#searchResults .pick");
  await picky.panel.locator("#searchResults .pick-main").first().click();
  await picky.panel.waitForSelector(".note.warn", { timeout: 6000 });
  check("forcing one explains and copies it instead", (await picky.panel.locator(".note.warn").textContent()).includes("clipboard"));
  eq("...with the value ready to paste", await picky.panel.evaluate(() => navigator.clipboard.readText()), "University of Waterloo, Canada");
  eq("...and the field left as it was", await picky.form.evaluate(() => document.getElementById("q_school").value), "");
  await picky.panel.locator("#nextBtn").click();
  await onField(picky.panel, "Email");
  await clickTop(picky.panel);
  await picky.panel.waitForSelector(".note.warn");
  check("a field that refuses a value gets the same help", (await picky.panel.locator(".note.warn").textContent()).includes("paste"));
  await closeAll(picky);

  const hostile = await open("https://jobs.lever.co/hostile/1/apply");
  await startForm(hostile.panel);
  await hostile.panel.waitForSelector("#fieldLabel");
  check("page text shows as text", (await label(hostile.panel)).includes("<img"));
  await hostile.panel.locator("#nextBtn").click();
  await hostile.panel.waitForFunction(() => Panel.state.field && Panel.state.field.type === "select");
  await hostile.panel.waitForTimeout(100);
  check("...in options too", (await hostile.panel.locator("#suggestions").textContent()).includes("<img"));
  eq("...and creates no elements", await hostile.panel.locator("#fillView img").count(), 0);
  check("...and runs nothing", await hostile.panel.evaluate(() => !window.__pwned));
  await closeAll(hostile);

  section("Fit: the report card");
  await sw.evaluate(async () => {
    const { profile } = await chrome.storage.local.get("profile");
    profile.prefs = { payMin: "140000", payMax: "170000", currency: "USD", styles: { remote: true, hybrid: true, onsite: false }, places: "New York" };
    await chrome.storage.local.set({ profile });
  });
  const claudeCalls = [];
  let claudeReply = null;
  await context.route("https://api.anthropic.com/**", async (r) => {
    claudeCalls.push({ headers: r.request().headers(), body: JSON.parse(r.request().postData() || "{}") });
    const reply = claudeReply || { status: 500, body: {} };
    await r.fulfill({ status: reply.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(reply.body) });
  });
  const post = await open("https://job-boards.greenhouse.io/acme/jobs/9");
  await post.panel.waitForSelector("#reportCard", { timeout: 8000 });
  check("a posting with no form opens on its report card", await post.panel.evaluate(() => Panel.state.view === "fit"));
  const score = await post.panel.locator("#fitScore").textContent();
  check("it gives a fit score", /^\d+%$/.test(score), score);
  check("...and a callback chance", ["Low", "Medium", "High"].includes(await post.panel.locator("#callbackChance").textContent()));
  const reportText = await post.panel.locator("#reportCard").textContent();
  check("pay is placed against your range", reportText.includes("$150k–$180k") && reportText.includes("In your range"), reportText);
  check("remote work matches your styles", reportText.includes("Remote suits you"));
  check("the years asked are compared with yours", reportText.includes("Asks 15+ years"));
  check("it says the estimate is built-in", reportText.includes("Built-in estimate"));
  const gapsText = await post.panel.locator("#gapLines").textContent();
  check("missing experience is listed as a gap", gapsText.includes("Kubernetes") && gapsText.includes("15+ years"), gapsText);
  check("matching experience is listed as a fit", (await post.panel.locator("#fitLines").textContent()).includes("SQL and Python"));
  check("benefits and legal text aren't judged", !(await post.panel.locator("#linesCard").textContent()).includes("401k"));
  await post.panel.waitForFunction(() => FitPanel.state.marked > 0);
  const marks = await post.form.evaluate(() => Object.fromEntries(["sql", "k8s", "yrs", "deg", "ben"].map((id) => [id, document.getElementById(id).getAttribute("data-callback-fit")])));
  eq("lines are marked on the page", JSON.stringify(marks), JSON.stringify({ sql: "strong", k8s: "gap", yrs: "gap", deg: "strong", ben: null }));
  check("...each with its reason on hover", (await post.form.getAttribute("#k8s", "title")).startsWith("✕ Gap: Not in your saved experience"));
  check("...and a line split by formatting is still found", marks.k8s === "gap");
  await post.panel.screenshot({ path: join(RESULTS, "panel-fit.png"), fullPage: true });
  await post.form.screenshot({ path: join(RESULTS, "page-marked.png") });
  await post.panel.locator("#markToggle").uncheck();
  await post.form.waitForFunction(() => !document.querySelector("[data-callback-fit]"));
  check("marks can be turned off", true);
  await post.panel.locator("#markToggle").check();
  await post.form.waitForFunction(() => document.querySelectorAll("[data-callback-fit]").length > 0);

  section("Fit: Claude's reading");
  check("without a key, it explains the option", (await post.panel.locator("#claudeCard").textContent()).includes("your own Claude API key"));
  await post.panel.locator("#addKey").click();
  await post.panel.locator('[data-setting="claudeKey"]').fill("sk-ant-test-0000");
  await post.panel.locator('[data-setting="claudeKey"]').press("Tab");
  await post.panel.waitForFunction(() => chrome.storage.local.get("settings").then((r) => r.settings && r.settings.claudeKey === "sk-ant-test-0000"));
  check("the key is kept apart from your info", !JSON.stringify(await saved()).includes("sk-ant-test"));
  await post.panel.locator("#tabFit").click();
  await post.panel.waitForSelector("#runClaude");
  check("the button says roughly what it costs", /about \d+¢/.test(await post.panel.locator("#runClaude").textContent()));
  const lineNo = (t) => post.panel.evaluate((x) => FitPanel.state.report.lines.find((l) => l.text.includes(x)).i, t);
  claudeReply = { status: 200, body: {
    id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn",
    usage: { input_tokens: 4000, output_tokens: 3000 },
    content: [{ type: "text", text: JSON.stringify({
      fit: 81, callback: "high", callbackWhy: "Strong on the core stack.", level: 3, technical: 72, summary: "Your SQL and Python work is a direct match. Infrastructure tooling is the gap.",
      lines: [{ i: await lineNo("SQL and Python"), verdict: "strong", note: "Years of SQL and Python at Globex." }, { i: await lineNo("Kubernetes"), verdict: "partial", note: "Shipped services, but no Kubernetes named." }]
    }) }]
  } };
  await post.panel.locator("#runClaude").click();
  await post.panel.waitForFunction(() => FitPanel.state.report && FitPanel.state.report.source === "claude");
  eq("Claude's fit score replaces the estimate", await post.panel.locator("#fitScore").textContent(), "81%");
  check("...with its reasoning and cost shown", (await post.panel.locator("#reportCard").textContent()).includes("Infrastructure tooling is the gap") && (await post.panel.locator("#reportCard").textContent()).includes("Opus 5.5, 8¢"));
  await post.form.waitForFunction(() => document.getElementById("k8s").getAttribute("data-callback-fit") === "partial");
  check("...and its line verdicts replace the marks", true);
  const call = claudeCalls[0];
  check("the request uses the default model and structured output", call.body.model === "claude-opus-5-5" && call.body.output_config.format.type === "json_schema" && call.body.output_config.effort === "medium", call.body.model);
  check("...with refusal fallbacks on", call.body.fallbacks === "default" && call.headers["anthropic-beta"] === "server-side-fallback-2026-07-01");
  check("...and the key and version headers", call.headers["x-api-key"] === "sk-ant-test-0000" && call.headers["anthropic-version"] === "2026-10-21" && call.headers["anthropic-dangerous-direct-browser-access"] === "true");
  const sentText = JSON.stringify(call.body);
  check("it sends your work history", sentText.includes("Globex"));
  check("...but never contact details or self-ID answers", !sentText.includes("testa@example.com") && !/veteran/i.test(sentText) && !sentText.includes("1 Test St"));
  await post.panel.reload();
  await post.panel.waitForFunction(() => window.Panel && Panel.state.access !== "checking");
  await post.panel.locator("#tabFit").click();
  await post.panel.waitForFunction(() => FitPanel.state.report && FitPanel.state.report.source === "claude");
  eq("reopening shows the saved reading without paying again", claudeCalls.length, 1);
  claudeReply = { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } };
  await post.panel.locator("#runClaude").click();
  await post.panel.waitForSelector("#claudeCard .note.warn");
  check("a bad key gets a plain explanation", (await post.panel.locator("#claudeCard").textContent()).includes("didn't accept that API key"));
  await post.panel.close();
  await post.form.waitForFunction(() => !document.querySelector("[data-callback-fit]"));
  check("closing the panel removes the marks", true);
  await post.form.close();
  await sw.evaluate(() => chrome.storage.local.remove("settings"));

  section("Save as Applied");
  const boardJobs = async () => {
    const b = context.pages().find((p) => p.url().startsWith("http://127.0.0.1:8765/callback/"));
    return b ? b.evaluate(() => Store.all().map((j) => ({ id: j.id, company: j.company, title: j.title, stage: j.stage, url: j.url, jd: j.jd, fit: j.fit, history: j.history.length }))) : [];
  };
  const flow = await open("https://jobs.lever.co/northwind/abc-1");
  await sw.evaluate(() => new Promise((ok) => {
    (function poll() { chrome.storage.local.get("postings").then((r) => (r.postings && r.postings["jobs.lever.co/northwind/abc-1"] ? ok() : setTimeout(poll, 50))); })();
  }));
  check("an opened posting is remembered for later", true);
  await flow.form.goto("https://jobs.lever.co/northwind/abc-1/apply");
  await flow.panel.waitForFunction(() => Panel.state.view === "fill" && Panel.formFields() > 0);
  await flow.panel.locator("#fillAll").click();
  await flow.panel.waitForSelector("#doneReview", { timeout: 20000 });
  const quietOpens = context.waitForEvent("page");
  await flow.panel.locator("#saveApplied").click();
  const quietBoard = await quietOpens;
  await flow.panel.waitForFunction(() => { const n = document.getElementById("savedNote"); return n && /Saved to your board/.test(n.textContent); }, null, { timeout: 15000 });
  eq("Save as Applied adds the job straight to the board", (await flow.panel.locator("#savedNote").textContent()).split(".")[0], "Saved to your board as Applied: Northwind, Senior Researcher");
  const boardTabActive = await sw.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url.startsWith("http://127.0.0.1:8765/callback/")).active);
  check("...in the background, without leaving the form", boardTabActive === false);
  let onBoard = (await boardJobs()).find((j) => j.company === "Northwind");
  check("...as Applied, with no review dialog", onBoard && onBoard.stage === "applied" && !(await quietBoard.locator("#jobDialog[open]").count()), onBoard);
  eq("...using the posting's address, not the form's", onBoard.url, "https://jobs.lever.co/northwind/abc-1");
  check("...with the description from the posting you opened earlier", onBoard.jd.includes("Kubernetes and Terraform"));
  check("...and how it fit", onBoard.fit && typeof onBoard.fit.score === "number" && onBoard.fit.gaps.some((g) => g.includes("Kubernetes")), onBoard.fit);
  await quietBoard.bringToFront();
  check("the card shows the fit", (await quietBoard.locator('[data-stage="applied"]').textContent()).includes(onBoard.fit.score + "% fit"));
  await quietBoard.locator('[data-stage="applied"] .card', { hasText: "Northwind" }).click();
  check("...and the job shows the fit and its gaps", (await quietBoard.locator("#historyLine").textContent()).includes("Fit when you applied: " + onBoard.fit.score + "%"));
  await quietBoard.locator("#jobClose").click();

  await flow.form.goto("https://jobs.lever.co/northwind/abc-1/thanks");
  await flow.panel.waitForSelector("#submittedCard");
  check("the thank-you page offers to save it", (await flow.panel.locator("#submittedCard").textContent()).includes("Sent your application?"));
  await flow.panel.locator("#saveApplied").click();
  await flow.panel.waitForFunction(() => /already on your board/.test((document.getElementById("savedNote") || {}).textContent || ""));
  eq("saving twice doesn't add it twice", (await boardJobs()).filter((j) => j.company === "Northwind").length, 1);
  await closeAll(flow);

  const savedFirst = await quietBoard.evaluate(() => Store.add({ company: "Acme", title: "Senior Data Engineer", url: "https://job-boards.greenhouse.io/acme/jobs/9", stage: "saved" }).id);
  const fitPost = await open("https://job-boards.greenhouse.io/acme/jobs/9");
  await fitPost.panel.waitForSelector("#fitSaveApplied", { timeout: 8000 });
  await fitPost.panel.locator("#fitSaveApplied").click();
  await fitPost.panel.waitForFunction(() => /Moved Acme/.test((document.getElementById("savedNote") || {}).textContent || ""), null, { timeout: 15000 });
  onBoard = (await boardJobs()).find((j) => j.id === savedFirst);
  check("a job you'd onBoard moves to Applied instead", onBoard.stage === "applied" && onBoard.history === 2, onBoard);
  check("...carrying Claude's reading when there is one", onBoard.fit && onBoard.fit.source === "claude" && onBoard.fit.score === 81, onBoard.fit);
  await closeAll(fitPost);
  await quietBoard.evaluate(() => Store.all().forEach((j) => { if (j.company === "Northwind" || j.company === "Acme") Store.remove(j.id); }));
  await quietBoard.close();

  section("Autofill: other pages");
  const custom = await open("https://careers.custom.example/apply");
  check("the script isn't on other sites by itself, and the panel can add it where it's allowed", await custom.panel.evaluate(() => Panel.state.access === "ok"));
  await startForm(custom.panel);
  await onField(custom.panel, "Email");
  check("...and it works there", true);
  await closeAll(custom);

  const framed = await open("https://careers.embedded.example/job");
  await framed.panel.waitForSelector("#startBtn");
  await framed.panel.locator("#startBtn").click();
  await onField(framed.panel, "Email");
  await clickTop(framed.panel);
  await framed.panel.waitForFunction(() => Panel.state.atEnd);
  eq("a form embedded in a frame fills", await framed.form.frameLocator("#f").locator("#e").inputValue(), "testa@example.com");
  await closeAll(framed);

  const nothing = await open("https://careers.selected.example/job");
  await nothing.panel.waitForSelector("#noFormCard");
  check("a page with no form says so", true);
  await closeAll(nothing);

  const settings = await context.newPage();
  await settings.goto("chrome://version");
  const stab = await sw.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url === "chrome://version/")?.id);
  const sp = await context.newPage();
  await sp.goto(`chrome-extension://${extId}/panel.html?tab=${stab}`);
  await sp.waitForFunction(() => window.Panel && Panel.state.access === "blocked");
  check("Chrome's own pages are left alone", true);
  await sp.close();
  await settings.close();

  section("Autofill: turning on a site");
  const site = await open("https://careers.custom.example/apply");
  await site.panel.evaluate(() => { Panel.state.access = "none"; Panel.showView("fill"); });
  await site.panel.locator("#turnOn").click();
  await site.panel.waitForFunction(() => Panel.state.access === "ok");
  const scripts = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  check("Turn on registers the form script for that site only", scripts.length === 1 && scripts[0].matches[0] === "https://careers.custom.example/*", scripts);
  await site.panel.locator("#tabInfo").click();
  await site.panel.locator('details[data-part="sites"] summary').click();
  await site.panel.locator('details[data-part="sites"] .btn').click();
  await site.panel.waitForFunction(() => !document.querySelector('details[data-part="sites"]'));
  eq("My info can turn it off again", (await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 0);

  section("Autofill: your info as a file");
  await site.panel.locator('details[data-part="self"]').waitFor();
  const grab = async (id) => {
    const d = site.panel.waitForEvent("download");
    await site.panel.locator(id).click();
    const file = await d;
    const { readFileSync } = await import("node:fs");
    return { name: file.suggestedFilename(), path: await file.path(), json: JSON.parse(readFileSync(await file.path(), "utf8")) };
  };
  const plain = await grab("#backupInfo");
  eq("a copy downloads", plain.name, "callback-my-info.json");
  check("...and leaves out self-ID answers", plain.json.profile.answers.veteran === undefined && plain.json.profile.answers.workAuth === "yes");
  const whole = await grab("#backupAll");
  eq("...unless you ask for them", whole.json.profile.answers.veteran, "no");
  await site.panel.locator("#eraseInfo").click();
  await site.panel.waitForTimeout(300);
  check("Erase clears everything", (await saved()).basics.email === "" && Object.keys((await saved()).answers).length === 0);
  await site.panel.locator("#backupFile").setInputFiles(whole.path);
  await site.panel.waitForFunction(() => Panel.profile().basics.email === "testa@example.com");
  eq("Restore brings it back", (await saved()).answers.veteran, "no");
  await closeAll(site);

  section("Autofill: opening the panel");
  const opener = await context.newPage();
  await opener.goto("https://careers.custom.example/apply");
  const wired = await sw.evaluate(async () => {
    const opts = await chrome.sidePanel.getOptions({});
    return { path: opts.path, enabled: opts.enabled };
  });
  check("the side panel is set up", wired.path === "panel.html", wired);
  const menu = await sw.evaluate(() => new Promise((ok) => chrome.contextMenus.update("fill", {}, () => ok(!chrome.runtime.lastError))));
  check("the right-click menu has Fill this application", menu);
  await opener.close();
}
