# Scouting Log System — Setup

A private, login-gated logging system for your 2027 prospect pages. No server to
run — it uses **Firebase** (which your site already loads): **Firestore** stores
the reports, **Firebase Auth** makes sure only you can create/edit them. Your
public player pages read the reports and render the log automatically.

## What each file does

| File | Where it goes | Purpose |
|------|---------------|---------|
| `firebase-init.js` | site root | Initializes Firebase, exports `db` + `auth`. **Reconcile with your existing one.** |
| `admin.html` | site root | Your private page to log/edit reports (login required). |
| `report.html` | site root | Renders any single report by id (`report.html?id=…`). |
| `styles.css` | site root | Updated (form styles + existing log/tag styles). |
| `2027-nba-draft-prospects/roster.js` | prospects folder | All 16 players' identity + photo + default physical line. |
| `2027-nba-draft-prospects/player-log.js` | prospects folder | Renders each player's log from the database. |
| `2027-nba-draft-prospects/seed-reports.json` | prospects folder | Your current reports, for the one-time import. |
| `firestore.rules` | Firebase console | Public read, write locked to your account. |

The player log pages (`<slug>/<slug>.html`) were updated to render their log
dynamically. The old static `preseason.html` pages still exist as a snapshot —
they're no longer linked from the log and can be deleted after you import.

## One-time setup (~10 min)

1. **Firebase console** (console.firebase.google.com) → your project.
   - **Build → Firestore Database → Create database** (production mode).
   - **Build → Authentication → Get started → Email/Password → Enable.**
     (You don't need to add a user by hand — you'll create your account from the
     admin page's **Sign Up** button.)

2. **Config.** In `firebase-init.js`, replace the placeholder `firebaseConfig`
   with your web app's config (Project settings → Your apps → SDK setup). If you
   already have a `firebase-init.js`, just make sure it exports `db` and `auth`
   like the reference file does.

3. **Upload** all the files to the matching locations in the table above.

4. **Create your account.** Visit `yoursite.com/admin.html`, enter your email and
   a password (6+ characters), and click **Sign Up**. You're now signed in, and
   the top of the page shows `UID: …` — that long string is your account's ID.

5. **Lock editing to you (two places, same UID).** Copy that UID into:
   - **`firestore.rules`** — replace `PASTE_YOUR_UID_HERE`, then paste the rules
     into **Firestore → Rules → Publish**. *This is the real lock* — it's what
     actually stops anyone else from writing.
   - **`admin.html`** — set `const OWNER_UID = "your-uid-here";` near the top of
     the page script. This hides the form from anyone who isn't you (so a stranger
     who signs up just sees a read-only notice instead of the editor).

   Do both right after signing up. After this, other people can still **read** all
   your reports on the site, but only your account can **add or edit** them.

6. **Import your current reports.** On `admin.html`, click **Import starter
   data** once. This loads all 16 existing reports into the database. Done —
   your player pages now pull from Firestore.

## Logging a new game report

1. Go to `yoursite.com/admin.html` and **Log In**.
2. Pick the player (their Info line pre-fills automatically).
3. Fill in the boxes: Title (e.g. `Kansas vs Baylor`), Date, Draft Projection,
   NBA Role Projection, Info, Stats, Physical, Offense, Defense, Outlook, and
   Summary.
4. **Save Report.** It appears instantly on that player's log page, newest first,
   and opens at `report.html?id=…` for anyone visiting your site.

Edit or delete any report from the **Existing Reports** list on the same page.

## Notes

- **Security & sign-up:** Anyone can reach `admin.html` and even create an
  account with **Sign Up** — that's harmless. Creating an account does *not* grant
  edit access. Writing is blocked by the Firestore rule unless the signed-in UID
  matches the one you published, and the form itself is hidden from non-owners once
  you set `OWNER_UID`. So a stranger who signs up just gets a read-only notice.
  Reads are public on purpose so visitors see your work. Want the logs private too?
  Change the `read` rule to `if request.auth != null` — but then the public pages
  won't show them. (If you'd rather no one else can even create an account, you can
  delete the Sign Up button after you've made yours — it's one line in `admin.html`.)
- **Brandon McCoy** has no photo yet. Drop one into `assets/images/` and set his
  `image` field in `roster.js` (e.g. `"brandonmccoy.webp"`).
- **Adding a player later:** add an entry to `roster.js` and create a
  `2027-nba-draft-prospects/<slug>/<slug>.html` page (copy an existing one, change
  the `data-slug` and hero text). Then log reports for them in `admin.html`.
