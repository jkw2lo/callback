# Callback

A job hunt board. Right-click a posting to save it, send each company its own tracked link
to your portfolio, and see whether they opened it.

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

## Install the right-click menu (desktop Chrome)

1. Keep this folder somewhere permanent.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension` folder.

Right-click a job posting and choose **Add to Callback**, or click the extension's toolbar icon.
If the description comes out wrong, highlight the right text first and then right-click:
highlighted text always wins.

The extension can only read a page at the moment you capture it (`activeTab`). It holds a
draft just long enough to hand it to the board, and has no account or copy of your jobs.

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
  background.js       the right-click menu; captures a page and opens the board
  extract.js          reads the job details from a page
  bridge.js           passes a draft to the board
tests/                end-to-end tests
```
