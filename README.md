# Callback

A job hunt board. Right-click a posting to save it, send each company its own tracked link
to your portfolio, and see whether they opened it. On a posting, a side panel shows how the job
fits your experience, line by line. On the application form, it fills in your saved info.

Plain HTML/CSS/JS with no build step, so it deploys straight to GitHub Pages.

## What it does

- **Board:** Saved, Applied, Interviewing, Offer and Closed. Drag a card to move it. On a
  phone, the stages become tabs and you change a job's stage in its form.
- **Right-click capture:** **Add to Callback** reads the posting and opens the board with the
  company, role, location, pay, link and description filled in. You check them and press **Save job**.
- **The job description stays:** the full text is saved, so you still have it after the posting comes down.
- **A link for each job:** every job gets a portfolio link and a resume link with its own tag.
- **Who opened it:** each card shows portfolio visits, resume views and downloads for that link.
- **Duplicates:** the form warns you if you already saved the posting.
- **Also:** which resume version you sent, follow-up dates, notes, search, and a backup file.

## Install the extension (desktop Chrome)

1. [Download the extension](https://jkw2lo.github.io/callback/callback-extension.zip), which is
   also linked under the board's ⋮ menu.
2. Unzip it and keep the `callback-extension` folder somewhere permanent, because Chrome loads it from there.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and choose the `callback-extension` folder.

To update it, replace that folder with a newer download and press the reload icon on the
extension's card in `chrome://extensions`.

After changing anything in `extension/`, run `tools/package-extension.sh` to rebuild the zip.

Right-click a job posting and choose **Add to Callback**. If the description comes out wrong, highlight the right text first and then right-click:
highlighted text always wins.

To capture a page, the extension reads it at that moment. It holds a draft just long enough to
hand it to the board, and has no account.

## Filling applications

Click the toolbar icon, or right-click and choose **Fill this application**, to open the side panel.

**Fill the form** does a first pass: it fills every empty field it has a clear answer for, then lists
what it put in and what's left for you, with the reason ("Nothing saved fits", "No saved answer", "Tick it
yourself"). What it filled is outlined with dashes on the page. Click a row to change that field, or **Undo**
to empty a text box or dropdown. It skips fields you've already answered, consent checkboxes and anything
it isn't sure of, and picks up questions that only appear after an earlier answer. **Done reviewing**
removes the outlines.

To go field by field instead, click a field on the form, or press **Start at the first empty field**.

- **Suggestions:** the panel shows what the field is asking and your saved info that fits, best first.
- **Filling:** click a suggestion, or press Enter on it, and it goes in and moves to the next empty field.
  **Next** and **Back** walk the form. **Search all my info** finds anything else you've saved.
- **You start it:** nothing goes into a form until you click a suggestion or **Fill the form**. It never moves
  between pages, and it never submits. Files aren't filled, so attach your resume yourself.
- **Fields it can't fill:** the value goes on your clipboard, and the panel tells you to paste it.
- **It learns:** answer something yourself and it offers to save that for similar questions. If you
  pick a suggestion other than the top one, that comes first next time.
- **Tracked links:** on a form for a job on your board, portfolio fields offer that job's tracked link first.

Everything you save is under **My info**. **Import my resume** pulls work history, education and links
from the Projects site's `resume.json`, and only adds what's missing.

**Your info stays in this browser.** It's in the extension's own storage, never in Firebase or on the board,
and a page gets a value only when you fill it. Self-identification answers (veteran, disability, gender,
race and so on) start blank and are never guessed. Once you've saved one, **Fill the form** uses it too. Removing the extension erases all of it, so use
**Download a copy**, which leaves self-ID answers out unless you ask for them.

**Which sites:** the form script runs on the job portals listed in `manifest.json` (Greenhouse, Lever, Ashby,
Workday, iCIMS and others) and only talks once the panel is open. On any other site, opening the panel from
the icon lets it in for that page, and **Turn on for this site** keeps it on; turn it off under My info.
It skips passwords, card numbers and social security numbers.

The extension also keeps a short list of your jobs (company, role, stage, posting link and tracked links, no
notes or descriptions), sent by the board, so it can match a form to a job.

Tested against live Greenhouse, Lever and Ashby forms. Workday needs an account to reach its forms, so its
sections and list buttons have only been tested on a copy built to match. The other portals haven't been tried.

## Save as Applied

When you've submitted an application, press **Save as Applied** in the side panel. It's on the review list
after **Fill the form**, at the end of the form, on the thank-you page after you submit, and on the Fit tab.
The job goes straight onto your board under Applied, with no review step and without taking you off the page:
the board opens in a background tab if it isn't open already.

It carries the job description and how the job fit. The description usually lives on the posting rather than
on the form or the thank-you page, so the panel remembers the last 30 postings you open (in this browser only)
and uses the one that matches. A job already on your board moves from Saved to Applied instead of being added
twice, and one that's further along is left where it is. Cards show the fit ("72% fit"), and the job's details
show the score and its top gaps.

## Job fit

Open the side panel on a job posting and the **Fit** tab shows a report card, before you decide to apply. A posting with no
application form opens on it by itself.

- **Fit score and callback chance:** how much of what the job asks your saved experience covers,
  with requirements counting most, and a rough Low, Medium or High chance of a callback.
- **Pay:** the job's range drawn against yours (set it under My info → What you're looking for).
- **Level:** where the job sits from Entry to Director+, against your level, with the years it asks for.
- **How technical:** from the tools and skills it names.
- **Location:** remote, hybrid or on-site and where, against your work styles and places.
- **Line by line:** each requirement is a fit, a partial fit or a gap, with the reason. The same
  lines are marked on the page in green, amber and red; hover one for its reason, or click it in the
  panel to scroll to it. The marks come off when you close the panel.

**Built-in estimate:** free, instant and private. It matches each line against your work history, education,
skills and summary. Everyday words are ignored, named tools and skills count most, and related wording
earns partial credit ("policy" against your "governance", "catalogue" against "catalog"), with the note
saying which of your words it matched. Lines about how you work ("leads with humility") are left
unjudged. It's still a rough read; Claude's is the one to trust for nuance.

**Claude's reading (optional):** paste your own Claude API key under My info → Claude analysis, then press
**Analyze with Claude** on a posting. Claude judges each line by meaning and gives its own score, level,
callback chance and summary; pay and location still come from the rules. It sends the posting with your
work history, education, skills and summary, never your contact details or self-ID answers. It uses Claude
Opus 5.5 by default (about 10¢ a posting, billed to your key), or pick Sonnet 5.5 or Haiku 5.5 for less.
Results are kept for the 40 most recent postings, so reopening one doesn't cost again. The key stays in the
extension's storage, apart from your info and its downloaded copies.

On sites that aren't job portals (LinkedIn, Indeed, company pages), open the panel from the toolbar icon
so it can read the page, or use **Turn on for this site**. To judge only part of a page, highlight it and
press **Refresh**.

## Links and visits

Links point at the Projects site (`https://jkw2lo.github.io/projects/?for=<tag>`), which
already counts visits by tag in Firestore's `showcase_visits`: `pf-<tag>` for the home page,
`rv-<tag>` for resume views and `rd-<tag>` for downloads. Callback only reads those numbers.
Nothing needs to change on the Projects site.

Tags are random (`k7m2xq`) so a recruiter can't see a company name in the link. Callback remembers which
tag belongs to which job. They appear as those random codes on the Projects `#stats` page.

Visits to individual project pages aren't tagged, so Callback can't show which projects a company looked at.

## Sync

Jobs are saved in this browser's IndexedDB, so the board works signed out and offline. It
doesn't use localStorage because every project on `jkw2lo.github.io` shares that allowance, and job
descriptions are long.

Sign in with Google under the ⋮ menu to sync jobs to Firestore at `jobhunt/{uid}/jobs/{jobId}`
in the shared `github-projects-5d4e4` project. Whichever copy of a job changed last wins. Deleted
jobs stay as empty records so that the deletion reaches your other devices.

**One-time setup:** in the Firebase console, open Firestore Database → Rules, add this next
to the `launchpad` rule, and Publish:

```
match /jobhunt/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

## Running a local copy

Serve the folder that contains this project on port 8765, then open `http://127.0.0.1:8765/callback/`:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory ..
```

To send captures to that copy, run this from the extension's service worker console:

```js
chrome.storage.local.set({ boardUrl: "http://127.0.0.1:8765/callback/" })
```

Run the tests with `node tests/run.mjs`. They need Playwright's Chromium, and they drive the real extension.

## Files

```
index.html            the page
css/style.css         the look, light and dark
js/store.js           jobs in IndexedDB
js/sync.js            sign-in, job sync and reading visits
js/app.js             the board, the job form and settings
extension/            the Chrome extension
  background.js       the right-click menu and toolbar icon; captures a page and opens the board
  extract.js          reads the job details from a page
  bridge.js           passes drafts to the board, and a short job list back
  fill.js             on forms: reads what each field asks and puts in what you click
  panel.html, .js     the side panel's Fill tab
  info.js             the side panel's My info tab
  match.js            works out what a field is asking and ranks your info for it
  fit.js              how a posting fits your experience, built-in or from Claude
  fitpanel.js         the side panel's Fit tab
  jd.js               marks the job description's lines on the page
  profile.js          your saved info, and importing your resume
tests/                end-to-end tests (autofill.mjs has the forms)
```
