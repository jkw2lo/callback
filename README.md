# Callback

A job hunt board. Right-click a posting to save it, send each company its own tracked link
to your portfolio, and see whether they opened it. On the application form, a side panel
suggests your saved info for each field, and one click fills it.

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
Then click a field on the form, or press **Start at the first empty field**.

- **Suggestions:** the panel shows what the field is asking and your saved info that fits, best first.
- **Filling:** click a suggestion, or press Enter on it, and it goes in and moves to the next empty field.
  **Next** and **Back** walk the form. **Search all my info** finds anything else you've saved.
- **It never acts alone:** nothing goes into a form until you click it, it never moves between pages, and
  it never submits. Files aren't filled, so attach your resume yourself.
- **Fields it can't fill:** the value goes on your clipboard, and the panel tells you to paste it.
- **It learns:** answer something yourself and it offers to save that for similar questions. If you
  pick a suggestion other than the top one, that comes first next time.
- **Tracked links:** on a form for a job on your board, portfolio fields offer that job's tracked link first.

Everything you save is under **My info**. **Import my resume** pulls work history, education and links
from the Projects site's `resume.json`, and only adds what's missing.

**Your info stays in this browser.** It's in the extension's own storage, never in Firebase or on the board,
and a page gets a value only when you click it. Self-identification answers (veteran, disability, gender,
race and so on) start blank and are never guessed. Removing the extension erases all of it, so use
**Download a copy**, which leaves self-ID answers out unless you ask for them.

**Which sites:** the form script runs on the job portals listed in `manifest.json` (Greenhouse, Lever, Ashby,
Workday, iCIMS and others) and only talks once the panel is open. On any other site, opening the panel from
the icon lets it in for that page, and **Turn on for this site** keeps it on; turn it off under My info.
It skips passwords, card numbers and social security numbers.

The extension also keeps a short list of your jobs (company, role, stage, posting link and tracked links, no
notes or descriptions), sent by the board, so it can match a form to a job.

Tested against live Greenhouse, Lever and Ashby forms. Workday needs an account to reach its forms, so its
sections and list buttons have only been tested on a copy built to match. The other portals haven't been tried.

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
  profile.js          your saved info, and importing your resume
tests/                end-to-end tests (autofill.mjs has the forms)
```
