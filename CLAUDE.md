# keoda.cz

Personal site for **KeodaCZ** — Czech streamer (Twitch, YouTube, Instagram, TikTok,
Facebook, Discord, Steam). Scope: landing page + content archive + guides.
Not a shop, not a community platform.

Owner works from two machines (work PC + personal PC), never simultaneously.
Content is Czech; code, commits, and comments in English.

## Hosting architecture

Decided. Do not propose changes without asking.

| Hostname | Host | Purpose |
| --- | --- | --- |
| `keoda.cz`, `www` | GitHub Pages | this repo |
| `donate.keoda.cz` | Fourthwall | donations (not set up yet) |
| `shop.keoda.cz` | Fourthwall | merch (undecided) |
| — | Vedos | registrar + DNS + mailhosting |

Registrar, host, and mail are deliberately separate. Swapping any one is a DNS
edit, not a migration.

**Status: live.** Domain purchased and wired up 2026-08-27 — the site serves at
`https://keoda.cz` (Pages custom domain, Enforce HTTPS on, DNS at Vedos done).
No `base` in `astro.config.mjs`, ever — a dotted base also breaks the Astro
dev server.

## Stack

- **Astro**, static output only. No SSR, no adapters.
- **Sveltia CMS**, scoped to **schedule exceptions only** (see Schedule below).
  Browser-based, commits straight to this repo, works on mobile.
  Everything else (gear, guides) is plain markdown edited with Claude Code —
  a CMS for content that changes twice a year is pure overhead.

  Admin UI lives at `keoda.cz/admin` (`public/admin/`), built and deployed as
  part of this site. Publicly loadable by design: it holds no credentials, and
  authorization is GitHub's — no repo write access, no commits. The config is
  scoped to one `files` collection editing `data/exceptions.json`; a date
  picker, a two-option status, checkboxes for `timeUnknown` and `highlight`,
  and a `HH:MM` pattern on `start` keep malformed entries out. Entries start
  collapsed, and `public/admin/preview.js` replaces the default preview pane
  with one compact row per exception, in the admin's own colours (read
  from its computed styles, so both CMS themes work) — the built-in one
  relisted every field
  one per line, and `summary` cannot show the toggles because it interpolates
  values with no conditionals. That file uses the `createClass`/`h` globals the
  CMS provides, so no React script is needed, and it defers touching them until
  the CMS has loaded. It stays presentation-only: duplicating any scheduling
  rule there would drift from `schedule-core.ts`. Commits go straight to `main`, which triggers the deploy.

  Auth: **"Sign In with Token"** with a fine-grained GitHub PAT. No OAuth app,
  no auth server, no config change needed. PATs expire (90 days by default), so
  expect to regenerate occasionally.

  Do **not** configure PKCE. As of Sveltia's current docs, GitHub has put
  client-side PKCE support on hold and Sveltia cannot support it yet — their docs
  specifically call out AI assistants wrongly claiming it's available. Verify
  against the docs before changing the auth method.

  If PAT expiry becomes annoying, the escape hatch is deploying `sveltia-cms-auth`
  on Cloudflare Workers (free) for one-click GitHub login. Adds a dependency we're
  otherwise avoiding — only if actually asked for.
- Data files under `data/`, consumed at build time via content collections.
- Pagination via Astro's `paginate()` in `getStaticPaths`.

Prefer boring and dependency-light. Mobile-first — most traffic arrives from
social bios.

## Hard constraints

- **Static only.** GitHub Pages runs no server code of ours.
- **No secrets in this repo, ever.** Published output is public even from a
  private repo. API keys live in GitHub Actions Secrets and are used only during
  the build.
- **Nothing an API key can reach may be fetched from the browser.** All external
  data is fetched at build time and committed as JSON. One approved exception:
  the Twitch live check via decapi.me, which needs no key and cannot be known
  at build time (see Live status).
- **No build step that can't run from a clean clone.**

### Repository visibility

**Stay public.** Decided.

Actions Secrets are encrypted, live outside the code, are unreadable without
write access, and are masked in logs — a public repo is safe for API keys.
Repo privacy protects nothing here: a key baked into build output leaks either
way, and no key ever reaches the output.

Going private would cost a Pro plan (Pages from a private repo requires
Pro/Team/Enterprise) and would start metering Actions minutes against the
2,000/month allowance, which public repos don't consume. Money for nothing.

If a private repo ever becomes genuinely necessary, Cloudflare Pages serves them
free — but that's not this project.

If a feature needs a secret at request time, or needs to know who the visitor is,
it does not belong here. That's a Cloudflare Worker. Flag it, don't work around it.

## Explicitly out of scope

Dropped on purpose — do not build, do not suggest:
Twitch login, user accounts, points/leaderboards, polls, predictions, giveaways.
All need auth + a database.

**Live status**: no build-time badge, ever. Actions cron cannot do it — delays
measured on this repo run **one to four hours**, so a "live now" badge would be
wrong most of the time it mattered — and a real one would need a Worker. What
exists instead is a client-side check in `TwitchEmbed.astro`, described below:
player when live, one-line strip when offline. Nothing else on the site may
claim live status, because nothing else can know it.

The player lives in `TwitchEmbed.astro`, **inside the homepage hero between the
tagline and the socials row** (owner's call 2026-09-07, after comparing all
three candidate slots on a local build): while a stream is running it is the
reason anyone opened the page, and below the socials the eight chips pushed it
under the fold on a phone. Above the `h1` was tried and rejected. It is
**hidden unless the channel is actually live**, and even then **loaded on
click**, not on page view: the embed sets third-party cookies, and not shipping
those unasked is what keeps this site free of a consent banner. Until clicked it
is a plain link to Twitch, so it works without JavaScript.

The facade carries a **frame from the running stream** as its background —
`static-cdn.jtvnw.net/previews-ttv/live_user_keodacz-1280x720.jpg`. A CSS
background and not an `<img>` on purpose: browsers skip background images
inside a `display: none` subtree, so while the channel is offline it costs no
request at all, where an `<img>` would be fetched regardless. Contrast is
local, not a flat scrim — a radial spotlight behind the button, the play ring
given its own dark fill, and a text-shadow on the caption; a scrim heavy
enough to carry the text drowned the picture. Text over media uses
`--on-media` / `--on-media-muted`, the only tokens that deliberately do **not**
flip with the theme, because the scrim is dark in both.

The **stream's own title is the section heading** — the owner removed a
separate "Právě vysílám" above it on 2026-09-07 as saying less than the title
does. Title and category come from `decapi.me/twitch/title` and `/game`,
fetched **only after uptime confirms live**: offline those endpoints keep
returning the *last* stream's values, so trusting them would announce a stream
that ended days ago, and fetching them late keeps the offline case at one
third-party request. The title is written with `textContent`, never
`innerHTML` — it is third-party-delivered text — and an answer over 140
characters (Twitch's own title limit) is discarded as not-a-title. The `h2`
drops the site's condensed uppercase heading treatment: a stream title is
content, not a label.

**Offline, its place holds one quiet line**, not a box (owner's call
2026-09-07): a hollow ring, "Právě nevysílám", and the next stream from the
schedule. Deliberately not a card and not a link — the "Příští streamy" card
sits right below and already answers *when*, and the hero already links to
Twitch. All the line adds is the one thing nothing else on the page states:
whether a stream is running right now. That matters most on a stream day past
the start time, where the calendar's "Dnes od 18:30" otherwise reads as
"he's on".

Which day it names is picked **in the browser, not at build time**: once we know
the channel is offline, a start time that has already passed today must not be
offered as the next stream. So the build emits the upcoming timed streams in
`data-upcoming` and the browser chooses. Weekday names are baked (a pure
function of the date, via `weekdayLocative`) while "dnes"/"zítra" are resolved
live — a page built yesterday would otherwise be a day out. A day with
`timeUnknown` still counts, rendering "čas ještě nevím" rather than being
skipped.

Live status comes from `decapi.me/twitch/uptime/keodacz` in the browser at page
load — an exception to "all external data is fetched at build time", approved by
the owner 2026-09-03, because a static build genuinely cannot know it and the
alternative was a Worker. It needs no credentials, so the no-secrets-in-the-
browser rule still holds.

Two things that exception costs, both deliberate: a third-party request on every
homepage view, and reliance on someone else's uptime. **Every decapi endpoint
sets session cookies** — `uptime`, `title` and `game` alike — so every fetch
uses `credentials: 'omit'`; the browser then drops them and nothing is stored on
the visitor's device. Any new decapi call must do the same.

It **fails open** in every direction: an error, a timeout (4s), an unexpected
answer, or no JavaScript all show the player. Claiming "offline" while a stream
is running would send people away at the worst moment, so **only a definite
"offline" prints the strip** — the player is the CSS default and the strip is
opt-in, which is what makes every fallback path land on the player without
needing its own branch. All four paths were tested against the real service
(offline, a digit answer, an unrecognised answer, an unreachable host).

Note decapi answers "<channel> is offline" for a channel that **does not
exist**, so a typo in the channel name would read as offline rather than as an
error. Harmless here — the name is a constant — but it means the offline answer
is not proof the channel is real.

Two traps, both verified rather than assumed: `parent` needs one key per
hostname that frames the player (`keoda.cz`, `www.keoda.cz`, `localhost`) with
subdomains counted separately, and it fails as a silent black box if any is
missing — the list is derived from `site` so it cannot drift. And `autoplay`
defaults to **true** with `muted` **false**, so a plain embed would start a
stream out loud on page load; both are set explicitly.

## Data layer

All external content is pulled by GitHub Actions and committed as JSON. The site
never calls an API at runtime.

**The API gotchas and script conventions live in
`.claude/rules/data-fetching.md`** (moved there 2026-09-10) — YouTube, Twitch
clips, the merge rule, reconciliation, the workflow schedule, and running the
fetches locally.

> **Claude Code: read that file before changing anything under `scripts/`,
> `.github/workflows/`, or the fetch tests. It will not arrive on its own.**
>
> It carries `paths:` frontmatter and the globs are verified correct (Node
> `globSync`: eight patterns, 17 files, nothing in `src/`), but **nothing that
> loads on demand works in this setup** — tested 2026-09-11 in a fresh session
> that read a matching script: the rule did not load, and `/context` listed
> only the root CLAUDE.md. A nested `scripts/CLAUDE.md` with a marker in it
> failed exactly the same way, which is what rules out the rules feature, the
> frontmatter and the globs as the cause: the one thing both mechanisms share
> is loading when a matching file is read.
>
> Unexplained, and not worth more digging — the owner is on Claude Code
> 2.1.211, whose changelog note about on-demand rules and `--setting-sources`
> is a plausible culprit but was not confirmed. If it ever matters, the
> documented tool is the `InstructionsLoaded` hook, which logs which
> instruction files load and why.
>
> The split still earns its keep: it is 140 lines out of a file that loads in
> full every session, against one deliberate `Read` when working on the
> scripts. Do not undo it by pasting the content back here.

### Files

```
data/youtube.json        videos + shorts + stream archive
data/clips/<year>.json   Twitch clips, split by year — 2023 through 2026
data/hidden.json         hand-edited: IDs the site always skips
data/featured.json       hand-edited: manually pinned items
data/schedule.json       hand-edited: recurring stream pattern
data/exceptions.json     CMS-edited: dated overrides
```

The clip year files are globbed, not listed, so January opening a new one needs
no code change. The fetch scripts can be run by hand against a gitignored
`.env` — see the rules file above; prefer that to pushing and waiting.

**Generated files are never hand-edited.** Manual curation goes in
`featured.json` / `hidden.json` only. This is deliberate: the owner will forget to
add things manually, so automation must be the only path in.

### Schedule: base pattern + exceptions

Not an event calendar. Two files:

**`schedule.json`** — the recurring pattern, edited essentially never:
Mon, Wed, Fri, Sat, Sun, from ~18:30 to ~23:00. The site generates the next
2–3 weeks from this pattern.

**`exceptions.json`** — sparse dated overrides applied on top. Empty is the
normal state. The list is wrapped in an `{ "exceptions": [...] }` object because
Sveltia CMS edits named fields, not a bare top-level array. Entry shape:

```json
{ "date": "2026-09-04", "status": "off", "note": "svatba" }
{ "date": "2026-09-05", "start": "21:00", "note": "pozdější start" }
{ "date": "2026-09-06", "game": "Dead by Daylight" }
{ "date": "2026-09-07", "timeUnknown": true, "note": "čas dám vědět" }
{ "date": "2026-09-08", "start": "20:00", "game": "bonus", "highlight": true }
```

`status` is `off` or omitted — cancellation is the only state worth naming, so
there is deliberately no "moved" status. A time change is just `start`, which
overrides the pattern time; that keeps one way to say one thing. `timeUnknown`
means the stream happens but no time is promised (renders a dash, and no
calendar export). `highlight` opts an entry into the banner. An exception on a
normally free day adds a stream.

Owner rejected a `moved` status on 2026-09-02: with `start` filled it behaved
identically to a plain entry, and the Czech name wrongly suggested moving a
stream to a different day.

`endApprox` in `schedule.json` exists **only** so calendar exports have a
duration; the site itself still never renders a hard end time.

Logic lives in `src/lib/schedule-core.ts` (pure, unit-tested — `npm test`, run in
CI before deploy) with `src/lib/schedule.ts` binding it to the JSON files.

Rules:

- **Times are local Europe/Prague, stored as local, rendered as local.** Do not
  store UTC — 18:30 must stay 18:30 across both DST switches.
- **Which day is "today" is decided in the browser, not at build time.** A
  build bakes one fixed today and then goes stale, and the cron meant to
  refresh it runs hours late (see Actions cron caveats), so the calendar used
  to call yesterday "Dnes" for the first couple of hours after midnight —
  exactly when people look, since the stream ends around 23:00. Both
  `ScheduleCompact` and `ScheduleFull` therefore render past `HORIZON_DAYS`
  (21) with a `data-date` per row, and a small script hides days already gone,
  relabels via `dayLabel()`, and caps how many show. Verified against a build
  read six days later: still correct. Weekday names stay baked — a pure
  function of the date — and only the today-relative part is resolved live,
  the same split as the offline strip. Without JavaScript the build's own
  labels stand, which is correct at build time.
  - Gotcha: the `hidden` attribute does nothing against an author `display`
    rule, so `.day` / `.row` need their own `[hidden] { display: none }`.
    Reading `el.hidden` reported the rows as hidden while they were plainly
    still on screen; a screenshot caught it and a property read did not.
  - `HORIZON_DAYS` is shared with the `.ics` routes, so a rendered
    add-to-calendar link can never point at a file the build didn't generate.
    Verified: 15 links, 15 files.
- **The banner re-anchors itself in the browser too** (2026-09-08). It is on
  every page and its whole job is time-critical accuracy, so a stale build
  saying "Dnes nestreamuju" about yesterday was the most visible way the
  schedule could lie. `Banner` therefore carries `date`, `when` ('Dnes' |
  'Zítra' | 'V pátek') and `rest` (everything after the day word, leading
  space or colon included) alongside the composed `label`; the script drops
  entries whose day has passed, re-words the rest through `dayReferenceFor()`,
  and removes the whole strip if nothing is left. Verified against a real
  rendered page replayed on four later dates.
  - **Both copies of the marquee list must get the same treatment** — the loop
    shifts by exactly one copy, so filtering only one would desync it.
  - Filtering runs before the marquee block, so `retime()` measures the
    shortened text.
  - Known and deliberate: whether the strip scrolls or sits still is decided at
    build time from the entry count, so dropping one can leave a single entry
    still scrolling. Cosmetic, and better than rebuilding the ticker client-side.
- **Still rendered against build-time "today"**: which `.ics` files exist. Not
  worth chasing — a missing file only affects an add-to-calendar link for a day
  beyond `HORIZON_DAYS`, and past files are harmless.
- **Times are approximate.** Render "od 18:30", never a hard end time. The owner
  said "cca"; the site must not promise 23:00 sharp.
- **The banner is derived from this data, not authored separately.** One entry
  drives both the calendar and the banner — no double bookkeeping. It renders
  from `Base.astro`, so it is on every page: a cancellation is time-critical
  and someone arriving on `/vybaveni` from a social bio needs it too. Per-page
  includes drifted (gear never got one), which is why it lives in the layout. It
  fires automatically only where a viewer would otherwise turn up wrong:
  `off`, a changed `start`, or `timeUnknown`. Anything else is editorial and
  needs `highlight: true` — otherwise routine "which game today" entries would
  hijack the top of the page.
- **Several changes scroll as a one-line ticker** (owner's call 2026-09-02,
  stacking them felt too tall): a CSS marquee, duration derived from the text
  length so reading speed stays constant. A single change stays still — motion
  only when there is more than one thing to show. It pauses on hover/focus (CSS,
  so it works without JS) and has a stop button (JS, hidden until wired up).
  `prefers-reduced-motion` drops the animation and falls back to the wrapping
  list.
- Ticker invariants, each of which broke something when missed: a copy must
  never be narrower than the window (`min-width: 100vw`) or the track runs out
  of text mid-cycle and visibly jumps; slack inside a copy is spread with
  `justify-content: space-around` plus a matching `padding-right`, since `gap`
  does not apply across the seam between copies; and the duration is retimed
  from the measured distance so speed does not double on a wide screen.
- Two gotchas worth remembering: `animation-play-state` reports "paused" while
  the animation keeps running, so the stop button drives
  `Animation.pause()/play()`; and an unreferenced `ResizeObserver` can be
  garbage collected, so it is held in a variable.
- **Two entries for the same date are merged, not dropped.** Later entries win
  field by field (an empty CMS value counts as unset, so it can't erase a real
  one), and `mergeExceptions` reports the duplicated dates. `schedule.ts` prints
  a build warning; it deliberately does **not** fail the build, because a
  blocked deploy would mean a last-minute cancellation never reaches the site.
- Past exceptions stop rendering automatically. Never needs cleanup.

This is why cancellations go here and **not** in news: a news post doesn't
expire, so "no stream this weekend" is still sitting there in March making the
site look dead. A dated exception expires by itself.

Exceptions are the one thing edited reactively, away from the PC ("it's Thursday
evening and tomorrow's off"), which is why the CMS exists — a date picker and a
status dropdown on mobile beats hand-committing JSON, where a malformed date
fails silently.

### The archive is append-only

One rule worth carrying everywhere, because it governs what the data means
rather than how it is fetched: **the clip archive only ever grows.** There is no
"get all clips" call, so any fetch sees a window, never the whole history —
code that writes what it fetched would silently delete everything outside that
window. Removal is a flag (`removed: true`), never a deletion, so a clip that
vanishes from Twitch stops being linked without the archive forgetting it.

Consequence for the site: 2024 holds 157 clips against **zero** stream
recordings, and that is correct rather than a gap — 2024 was Twitch-only, and
YouTube is the stream archive. Don't "fix" it.

The mechanics — window walking, the backfill, the reconciliation safety valve —
are in the rules file.

## Why JSON and not a database

Deliberate, not a limitation. JSON diffs line-by-line so the repo stays small and
history stays readable; a committed SQLite file is a binary blob that rewrites
whole on every commit. Version history, offline access, both machines, zero cost,
nothing to authenticate against.

Size is a non-worry: **575 bytes per clip record measured** over the real 471
(264 kB across the four year files — the earlier ~250 B estimate here was
low), and it's a **build input** — Astro renders it to HTML, visitors never
download it. Only client-side search would need data in the browser, and a
stripped id+title+date index covers that.

A real database only enters the picture with visitor writes (accounts, points),
which is out of scope. That would be Cloudflare Workers + D1, a different project.

## Pages

Layout inspiration: `arcadebulls.cz` — structure and section rhythm, and **not**
its community features. Keoda's own palette and fonts throughout.

Exception, approved by the owner 2026-09-02: the **schedule rows** on
`/kalendar` deliberately follow arcadebulls' calendar layout (date badge left,
title middle, big accent time right, dotted card texture, bell menu for
add-to-calendar), rendered in Keoda's own colors. Owner asked for this directly.
Do not extend that borrowing to other pages without asking.

**Homepage** — hero (Twitch player or offline strip, socials), then the
compact schedule, **"Co si pustit"** (`LatestContent.astro`), then the gear
teaser. That third section exists because the page said nothing about 427
recordings and 471 clips, reachable only from the header nav, while most
traffic lands here from a social bio. The newest recording leads and two clips
sit beside it — three and a half hours is a lot to ask of a first-time
visitor, and a fifty-second clip is the better calling card.

Its layout was settled by measuring, and the numbers are worth keeping so
nobody re-litigates it: as a card in the 2fr column beside the calendar the
right column came out **976px against the calendar's 317px**; full width with
the clips as a side column was **1118px**, because three stacked 16:9
thumbnails are always taller than one. One row with the recording spanning two
of four columns is **485px**. Two clips and not three for the same arithmetic —
a third wrapped onto a line of its own. The section sizes itself with a
**container query** on its own width, not the viewport, so it works in a narrow
column or full width without knowing which it got.

**Markup order on the homepage is the phone's reading order** — schedule,
newest, gear — and the desktop layout puts gear back beside the schedule with
explicit `grid-row`/`grid-column` rather than relying on source order. Gear is
the least urgent thing for someone arriving cold and it used to be buried
under everything.

**Kalendář** (`/kalendar`) — the full schedule, arcadebulls-style rows with an
add-to-calendar menu per stream (Google Calendar link + a real `.ics` file built
at `/ics/<date>.ics`). The homepage carries only a **compact** version
(`ScheduleCompact.astro`) plus a link through; the full rows live on their own
page. Deliberately no per-row "notify me" — notifications would need accounts,
and a button that just links to Twitch was rejected as useless.

**A row leads with its note, not its category** (owner's call 2026-09-10). On a
day with both, "NightfallCraft Co-Op s Terousch" is what makes that evening
worth turning up to and "Minecraft" is the label, so the note takes the
headline and the game goes under it — which also matches the compact rows,
which always printed the note first. Two things ride along:

- **The type treatment follows the content.** A prose headline drops the
  condensed uppercase; that suits a one-word category and turns a real title
  into shouting. Same distinction `TwitchEmbed` already makes for a live
  stream's own title. The narrow-screen font-size override has to be restated
  for `.row-title.prose`, since two classes outrank one.
- **A cancelled day is exempt** and keeps "Nestreamuju" as its headline with
  the reason underneath. There the row's whole job is to stop someone turning
  up, and setting the reason big buries the one word that matters. Verify this
  case with a *future* off-day — the real ones are usually already in the past
  and past days are not rendered at all.

**Gear / used software** — styled like arcadebulls' gear page. Confirmed in scope
and the easiest page here; build it early. Plain markdown, no CMS.

**Guides** — same treatment. Static markdown in this repo, explicitly *not*
Notion. **Aimed at other streamers**, not at viewers (owner's call 2026-09-07):
how his own setup fits together — multistreaming, OBS, vertical output,
Streamer.bot. He explicitly ruled out game guides for viewers: "pro diváky ke
hrám bych asi neměl co psát." So a guide's job is to explain the *how* behind
what `/vybaveni` lists as the *what*, and the two pages should link to each
other.

Correction to an earlier note in this file: **nutty's Notion page was the
reference for the gear page, not for guides.** What the owner liked was that it
lists everything he uses — microphones, Elgato, OBS plugins — which is
`/vybaveni`'s job. Ours is thinner than that reference: software is listed by
name with no line on what each thing does, and OBS plugins are not a group at
all. Enriching it that way is the closer match to what was actually asked for.

> **Parked 2026-09-07, waiting on the owner — branch `gear-software-notes`.**
>
> That branch already adds an optional `note` per gear item (rendered under the
> name), splits Aitum Multistream and Vertical out into a **Pluginy do OBS**
> group — they are plugins, not standalone programs — and drafts a one-line
> description for each of the five software entries.
>
> It is **not on `main` on purpose**: those five lines were written from general
> knowledge of the software, not from how the owner actually uses it, so they
> need his read-through first. Merge once he has confirmed them.
>
> **Both blockers are the same blocker: he must be at the personal PC.** The
> OBS plugin list and anything else missing from the gear page (Elgato devices,
> a Stream Deck, mic arm, mixer, monitors) can only be read off that machine,
> and the first guide — **multistreaming via Aitum**, Twitch and YouTube at
> once, his most distinctive setup and the reason YouTube is the canonical
> stream archive — has to be written with OBS open in front of him.
>
> So do **not** raise either of these while he is on the work PC, and don't try
> to unblock them by building a page shell to react to: the missing thing is
> the machine, not motivation or a starting point. Ask when he mentions being
> at home. (See Two-machine workflow — he works from a work PC and a personal
> PC, never simultaneously.)

**`robots.txt` and `sitemap.xml`** — both endpoints (`src/pages/robots.txt.ts`,
`sitemap.xml.ts`), not files in `public/`, so the site URL comes from
`astro.config.mjs` and cannot drift. The sitemap globs `src/pages/**/*.astro`
rather than keeping a list, so a new page appears by itself; it skips `404`,
underscore-prefixed files and dynamic routes, and the `.ics` endpoints fall
outside the glob. No `lastmod`/`changefreq`/`priority`: Google ignores the last
two, and the deploy cron rebuilds twice a day, so a build timestamp would claim
every page changed daily. `robots.txt` disallows `/admin/` and `/ics/`.
Disallow only stops crawling, so `/admin` also carries its own `noindex` —
that's the half that keeps it out of results. Neither is a security measure;
`/admin` holds no credentials by design.

**404** (`src/pages/404.astro`) — GitHub Pages served its own "Page not found ·
GitHub Pages" screen until 2026-09-07, which read as a broken site. Astro emits
this route as `dist/404.html`, not `dist/404/index.html`, which is the filename
Pages looks for — don't "fix" that to a directory. It passes `noindex` to
`Base.astro`, which then also drops the `canonical` link: naming a real URL as
canonical for content that isn't at that URL is worse than saying nothing.

It is the one page centred in both axes (owner's call 2026-09-07) — a dead end
rather than a page whose content ran out. Two gotchas that took two attempts:
`min-height: 100%` on the container does nothing, because `main` takes its
height from the body's flex layout while its own `height` stays `auto`, so a
percentage has nothing definite to resolve against; the fix is
`:global(main) { display: grid }` in the page's own style block, which stretches
the container and — verified in the build output — lands only in
`dist/404.html`, not in the shared CSS or any other page. And centre the
container with `place-content`, never `margin`, or `.container` loses its
`margin-inline: auto` (see the Design gotcha above).

### The content archive

Three pages, owner's call 2026-09-08 after seeing the numbers. All render
through one `MediaCard.astro`, because a stream, a video, a Short and a clip
are the same shape: a picture, a title, a line of context.

- **`/streamy`** — 426 recordings, paginated 48 a page, tiles grouped by month
  with a sticky heading and a **ZÁZNAM** badge on each thumbnail so a recording
  is never taken for an edited video (owner's call 2026-09-08; it started as a
  list). The badge carries a **broadcast glyph** — inline SVG, `currentColor`,
  so it costs no request and follows the badge in either theme — behind a
  `badgeIcon` prop rather than always on, because `/klipy` reuses the same
  badge for Twitch's featured flag where a broadcast glyph would be a lie.

  **The gaps in the archive are real, not a bug.** 42 streams in 2023, none at
  all in 2024, 211 in 2025. The owner's account: in 2023 he streamed to YouTube
  only for about two months to try it, then went back to Twitch alone, and only
  started multistreaming in 2025. So YouTube holds everything from 2025 on and
  almost nothing before. Don't "fix" it, and don't go looking for lost
  recordings — Twitch VODs from then are long expired.
- **`/videa`** — the three edited videos first with wide cards, then all 83
  Shorts in a portrait grid. Together because both are his own published
  output. The page has to look deliberate with three videos and still work with
  thirty, so videos use `auto-fill` rather than a fixed column count.
- **`/klipy`** — viewer-made Twitch clips, paginated 48 a page (already
  paginated at 31 clips: retrofitting it onto a linked page is worse than
  having it early — and the backfill then proved the point, 31 → 471 with no
  route change). Credits the clip's author, which is the reason these are not
  merged with Shorts. Its badge sits **bottom left**, not top: owner's
  preference 2026-09-08, and it reads as a caption there rather than as a
  label, which suits "Doporučeno" — `badgeAt` on `MediaCard` decides.

**Titles are cleaned, not original.** `cleanTitle()` runs in the `content.ts`
view rather than over the JSON, so the rule can change with no re-fetch.
Measured on the real 426 stream titles: **98% carry 🔴 and 95% carry
`!dc !ig !clip`** — 832 red circles on a single page of tiles. It strips
exactly that boilerplate and nothing else: `🔴 Johny Silverhand | Cyberpunk
2077 🔴 !dc !ig !ttv` becomes `Johny Silverhand | Cyberpunk 2077`. The owner
asked on 2026-09-08 whether the ZÁZNAM badge made the originals usable again;
they stay cleaned because **🔴 means "live now", which is a lie in an archive
of recordings**, while the badge is true.

### Filtering and sorting

Built 2026-09-08. `src/lib/archive-filter.ts` (pure, tested) plus
`ArchiveFilter.astro`, which wraps all three archive pages. Search by title,
a date range, newest/oldest, most-viewed on `/klipy`, and a videos/Shorts
filter on `/videa`.

**Read this before changing it — the first design was wrong and the owner
caught it.** I claimed filtering and pagination were incompatible on a static
site (they are not: both move to the browser), then proposed dropping
pagination and rendering everything on one page. He objected correctly — that
is endless scrolling on a page that grows with every stream. Bytes were never
the problem; the scroll was. So it is client-side filtering **and** client-side
paging.

How it holds together, and each piece is load-bearing:

- **Two views, only ever one visible.** The *server view* is exactly what the
  build rendered — the right 48 tiles with real `<a>` pagination — and it is
  what a visitor without JavaScript gets and what a crawler indexes. The
  *results view* is built in the browser the moment anything is filtered.
  While nothing is filtered, paging is the server's job; once something is, it
  is the browser's. That split is what stops two pagers ever both being live,
  and it is why `isDefault()` ignores `page`.
- **The whole archive rides along in a `<template>`.** Template content is
  inert, so those hundreds of `<img>` tags are never fetched and never laid
  out — verified: on `/klipy` the document has 48 `<img>` elements and made 21
  image requests while holding 471 cards. Only the bytes cost anything: 56 kB
  gzipped for `/klipy`, 47 kB for `/streamy`, 20 kB for `/videa`.
- **The bar is `hidden` in the markup and unhidden by the script.** It has to
  be: there is no server to filter, so without JavaScript it would be a
  control that silently does nothing. `.bar[hidden]` needs its own
  `display: none` because the author `display: flex` beats the attribute —
  the same gotcha as the schedule rows.
- **`data-text` is normalised at build time**, not per keystroke. Diacritics
  are stripped so "zaznam" finds "záznam"; that is not tidiness, it is the
  difference between the search being usable and not.
- **`/videa` keeps two results grids**, keyed by `data-results` and matched
  against each card's `kind`. A portrait Short and a 16:9 video in one grid
  look like a layout bug, so the type filter hides a whole section instead,
  and a section with an empty grid hides itself. Its `pageSize` is 0 — 86
  items do not need paging.

  **`pageSize` with `kinds` now throws at build time**, and the reason is
  measured rather than assumed: set to 12 on `/videa`, the two grids shared
  one budget of 12 taken off the top of the globally sorted list, so with 3
  videos among 86 items the "Videa" section landed on page 2 and was hidden on
  pages 1, 3 and 4 — a heading blinking in and out as you page. Filtering and
  sorting are unaffected: those run over one flat pool of everything and the
  result is then split into the grids, so the counts are always right. It is
  only the *page budget* that cannot be shared.

  If `/videa` ever grows enough to need paging, the fix is a pager **per
  section** with its own page number. Don't pre-build it — it is three videos
  today, and the `Typ` filter is the natural way to narrow that page.
- **URL state via `replaceState`**, in Czech params (`q`, `od`, `do`, `typ`,
  `razeni`, `strana`), and only what differs from the default. A filtered view
  is shareable and survives reload; `pushState` would take a dozen Back
  presses to leave the page after typing a query.

**View counts** are what makes most-viewed possible, and they are written by
the **weekly reconciliation** — never the nightly fetch, which is the whole
point. The reconciliation already asks Twitch about every clip by id and the
answer carries `view_count` regardless. `shouldUpdateViews` then only rewrites
a line when the count moved by **at least a tenth, and at least 10** — the
site needs the ranking, not the number, and written verbatim a weekly run
would rewrite nearly every line and bury real changes in the history. The
floor of 10 is what stops 3 → 4 views churning every week. Range on the real
471: 1 to 139, median 34.

`src/lib/content-core.ts` holds the pure helpers (tested); `content.ts` binds
them to the JSON, applies `hidden.json` / `featured.json`, drops clips the
reconciliation marked `removed`, and globs `data/clips/*.json` so a new year
file needs no code change.

`featured.json` sets the order and is applied **in the order listed there** —
that order is the owner's ranking. A clip's own `featured` flag comes from
Twitch and deliberately drives only a badge, never the ordering, or the archive
would reshuffle without anyone touching the repo.

Stream titles go through `cleanTitle()`: he wraps them in 🔴 and ends them with
`!dc !ig !clip`, which is 423 of 512 titles carrying the same noise. It strips
standalone `!word` tokens and 🔴 only, keeps his other emoji, and falls back to
the original if stripping would leave nothing. Run over the real archive: 0
emptied, and the five biggest reductions all correct.

**Thumbnails — measured, not guessed:**

| | |
| --- | --- |
| YouTube `maxresdefault` | 188 kB, 1280×720 |
| YouTube `hqdefault` | **17 kB**, 480×360 with 45px letterbox bars |
| YouTube `mqdefault` | 11 kB, 320×180, too soft for a card |
| Shorts `oardefault` | ~100 kB, 1080×1920, the only reliable portrait one |
| Shorts `frame0` | 21 kB, 268×480 — **unusable**, see below |

`hqdefault`'s bars are exactly 45px top and bottom, leaving precisely 480×270,
so a 16:9 box with `object-fit: cover` crops them off and shows the full frame
at a ninth of the bytes. That crop is load-bearing, not tidying.

**Shorts' portrait thumbnail is resolved by the fetch script, not derived in
the page**, and this is the one to remember:

`oardefault.jpg` is **missing for 27 of 83 Shorts, and it does not fail
cleanly — it answers 404 with a valid 1 kB grey placeholder JPEG**, which
browsers render happily. The page showed grey boxes with three dots and nothing
errored anywhere; the owner spotted it, no test could have. Deriving thumbnail
URLs from an id is exactly the assumption that broke.

So `fetch-youtube.mjs` probes and stores a `portrait` URL per Short:
`oardefault` if it really is 200, else `frame0`, else nothing. `frame0` is
literally the first frame, so a Short that fades in gives a black image — but
the sizes separate cleanly, measured across all 83: usable 6.4–52 kB, flat ones
exactly 1,049–1,050 B. A `content-length` check settles it, so the script needs
no image decoding and stays dependency-free. Result: 56 via `oardefault`, 25
via `frame0`, 2 with neither — those fall back to the landscape thumbnail shown
whole (`fit="contain"`) rather than cropped to a random vertical slice.

`oardefault` is ~7× oversized for a 220px card and there is no smaller
reliable portrait variant; lazy loading keeps the cost to what is scrolled to.

Neither `i.ytimg.com` nor `static-cdn.jtvnw.net` sets a cookie (verified
2026-09-08), so unlike the Twitch player these load on view and the site still
needs no consent banner. **Check any new image host the same way.**

Gotcha: `MediaCard`'s wrapper is `.media`, not `.card`. `.card` is a global
utility with 1.2rem of padding, and reusing the name silently inherited it —
every thumbnail rendered 114px wide inside a 155px column. A component class
must not collide with a global one.

**News — dropped for now.** Owner is unsure they'd use it, and a stale news
section makes a site look abandoned worse than having none. Cancellations belong
in `exceptions.json` instead. Adding news later is an afternoon's work; don't
pre-build it.

Social links live in `data/socials.json` and render through one component,
`SocialLinks.astro`, in two shapes: labelled pills in the homepage hero, and
bare icons in the footer (`variant="icons"`, which hides the names visually
but keeps them for screen readers and as tooltips). All eight verified live 2026-09-03:
Twitch `/keodacz`, YouTube `@KeodaCZ`, Instagram `/keodacz`, TikTok
`@keodacz`, Facebook `/KeodaCZPage` (one C — an earlier note here said two),
Discord invite `qYSsFMCAQv` (server "Keodova výprava"), Steam
`/id/KeodaCZ`, Rankone `rankone.global/keodacz` (client-rendered app with no
embed API, so link only, no iframe).

Icons come from the `simple-icons` devDependency, inlined as SVG paths at
build time — no icon font, no runtime request. Rankone is not in that set, so
its brandmark lives in `src/icons/rankone.ts`, taken from their official press
kit; the kit itself was deliberately not committed. Rendered in Keoda's
palette, not each brand's colours: eight brand colours in one row would drown
out the site's own identity. The component warns at build time if an icon
fails to resolve, rather than shipping a gap in the row.

## Design

Decided with the owner 2026-08-27. Change only with explicit approval.

- Palette "wasteland": light mode = warm dark ink `#131108` on sand
  (`#f3edc9` → `#e2d795`); dark mode = the same palette mirrored (sand
  `#ded7b4` on `#131108`). Yellow `#f2dc5a` is the shared accent; buttons are
  yellow with dark text in both modes. Tokens: `src/styles/global.css`.
- Fonts: Barlow Condensed 700 (headings, uppercase) + Rubik (body),
  self-hosted via Fontsource packages. The owner's overlay font (Crafty
  Font - Rough) has zero Czech glyphs — unusable on the web, don't propose it.
- Light/dark follows the system, plus a manual toggle in the header
  (localStorage key `theme`, applied pre-paint in `Base.astro` to avoid flash).
- Layout: 1200px container; gear cards two-column from 800px up.
- Two-tone display headings: first word in `--text`, second in `--accent`,
  both solid. An outline-only variant was tried and rejected by the owner.
- **The "Ve výstavbě" strip is gone** (owner's call 2026-09-11, component
  deleted). It had already been reworded once when clips and videos shipped;
  with the archive, filtering, the calendar and the gear page all live, a site
  advertising itself as unfinished was underselling itself. Guides are still
  missing, and that is fine — an absent page says less than a banner announcing
  the absence. **Do not bring it back for the guides**; if it ever returns it
  needs a reason of its own.
- The schedule banner is **centred in its single-entry form only** (owner's
  call 2026-09-10). The multi-entry form is a marquee: it is moving, so it has
  no resting position to centre, and its text must start at the edge.
- The header nav **takes the room between the logo and the theme toggle and
  spreads across it** with `space-evenly` (owner's call 2026-09-10) — not
  `space-between`, which butts the outer links against both. At 1200px that is
  ~124px between links, which is airy; the owner saw it and approved.
- Gotcha: on an element that also carries `.container`, never write
  `margin: 0` — it wipes out `margin-inline: auto`, so the 1200px box sticks
  to the left edge and centred text inside it drifts with window width and
  browser zoom. Use `margin-block: 0`.

### Favicon and share card

Approved 2026-09-07. Both derive from the owner's own material; the brand
folder itself stays gitignored and only these outputs were committed.

- **Favicon**: the brush mark from `graphics/old/grafika streamu/Keoda logo.jpg`
  — **the complete mark**: K, its sweeping tail, and the small glyph beside it
  — flattened to ink-on-accent (owner picked dark-K-on-yellow, and the full
  mark over a tighter crop on 2026-09-07). Shipped as `public/favicon.ico`
  (16/32/48, PNG-encoded entries), `public/icon-32.png` and
  `public/apple-touch-icon.png` (180, with a margin so iOS's rounded-corner
  mask cannot clip the strokes).

  **Do not crop the tail off.** Cropping to just the K letterform reads as a
  capital **A**, not a K — the tail is what makes the letter legible, and the
  owner spotted it immediately. The brush `KEODA` wordmark is separately
  unusable at icon size. Accept that 16px is soft; recognisability beat
  crispness here.
- **Share card**: `public/og.jpg`, 1200×630 — the wasteland skyline from
  `graphics/Backgrounds/Twitch background.jpg` under a bottom-weighted scrim,
  with the name, tagline and `keoda.cz` in the site's own fonts. Wired up in
  `Base.astro` with absolute `og:image` / `og:url` (relative ones are ignored
  by most platforms) and a per-page `canonical`, trailing-slash-normalised.

**Gotcha worth keeping: this project's `sharp` cannot render the site's fonts.**
Its SVG renderer ignores `@font-face` outright, including a woff2 embedded as a
data URI — proven by rendering the same text with an embedded Barlow Condensed
and with a deliberately missing font and measuring identical 438px-wide output.
Gradients and compositing it handles fine. So any future asset needing Barlow
Condensed or Rubik has to be rasterised in a **browser** and composited in
sharp, not typeset by sharp. ImageMagick is not available here either — on
Windows `convert` resolves to the filesystem tool, not ImageMagick.

The one-off generator scripts live in the scratchpad, not the repo: they read
from the gitignored brand folder, so they could never run from a clean clone.
The generated assets are committed instead.

## Working style

- **Visual/brand decisions (colors, fonts, imagery, favicon, logo) require
  showing options and getting the owner's explicit OK before anything goes
  live.** An early build was scrapped over an unapproved favicon. Build in
  small confirmed steps: show locally, get approval, then push.
- No Co-Authored-By trailers in commit messages.
- `Twitch and Youtube assets/` in the repo root is the owner's local
  brand-reference folder — gitignored, never commit it. It only exists on
  machines where the owner put it; the site build does not need it. Anything
  from it that should appear on the site gets copied into the repo
  deliberately, with approval.
- **State as of 2026-09-10, end of session.** Live and working: homepage
  (socials, Twitch player, compact schedule, "Co si pustit", gear teaser),
  `/kalendar`, `/vybaveni`, `/admin`, the 404 page, favicon, share card,
  `robots.txt`, `sitemap.xml`, the deploy keepalive, the content pipeline, and
  the three archive pages — `/streamy`, `/videa`, `/klipy` — with filtering and
  sorting on all three. Working tree clean, everything pushed.

  **Settled 2026-09-11: nothing loads on demand here.** Neither a path-scoped
  rule nor a nested `scripts/CLAUDE.md` reached context after a fresh session
  read a matching file. Consequence for how to work: **only this file arrives
  by itself**, so anything that must be known has to be here, and everything
  else has to be read deliberately. See the note under Data layer.

  The pipeline runs on its own schedule and has been committing unprompted
  since 2026-09-07. Tests gate the deploy — deliberately no count here, it only
  goes stale.

  **Next up, roughly in this order:**
  1. Parked, needs the personal PC: branch `gear-software-notes` and the first
     guide (see Pages).
  2. The open questions at the end of this file — the "last VOD next to the
     calendar" one is no longer blocked, since the data now exists.
  3. **This file is still ~4× its ~200-line target.** The data-fetching move on
     2026-09-10 took it 1008 → 870, which is progress and not the goal. The four
     sections that would actually move the needle are all component-level rather
     than cross-cutting, so they want the owner's read before they go:
     *Filtering and sorting* (153 lines), *Schedule* (123, of which the ticker
     invariants are the movable part), the Twitch player detail under
     *Explicitly out of scope* (96), and *The content archive* (42). The
     site-wide rules living inside them have to stay here whatever else moves:
     no live badge anywhere, times are local Prague and approximate, generated
     files are never hand-edited, titles are cleaned.
- Times converted to UTC for calendar exports only, in
  `src/lib/calendar-links.ts`, with the offset resolved per date — 18:30 Prague
  is 16:30Z in summer but 17:30Z in winter. Covered by tests.

## Deployment

Push to `main` → Pages publishes. No FTP. Tests run first; a failure blocks
the deploy.

The schedule is rendered at build time, so the deploy workflow also runs on cron
at 22:20 and 23:20 UTC — one of the two lands just after midnight in Prague in
either DST regime, so "Dnes" rolls over in weeks with no commits.

That cron is what `.github/workflows/keepalive.yml` protects. GitHub disables a
repo's `schedule` triggers after 60 days with no commits, which would freeze the
calendar on the last deploy's date and say nothing. The keepalive runs weekly
and makes an **empty commit only when the last commit is over 40 days old** — so
it adds nothing during normal activity (every CMS exception edit is a commit)
and at most a handful of commits during a long quiet spell. Weekly rather than
monthly on purpose: monthly runs plus a 40-day threshold could let a commit
reach 59 days before the next check, which is too close to the limit. Weekly
caps the worst case at 47.

It is the only workflow with `contents: write`; the deploy workflow stays
read-only. Its push uses `GITHUB_TOKEN`, which by design does not trigger other
workflows, so it cannot set off a deploy loop. If everything ever does get
disabled anyway, `workflow_dispatch` still works — running it by hand re-arms
the clock.

**Only `dist/` is deployed.** The Pages workflow uploads that one directory as the
artifact, so repo-root files — this file included — are never served. There is no
`keoda.cz/CLAUDE.md`.

Corollary: **never put anything private in `public/`.** Everything there is copied
into `dist` verbatim. That's the one way to accidentally publish a file that was
only meant for the repo.

Note this is about the *website*. The repo itself is public (see Repository
visibility), so this file is browsable on github.com by design. Keep it free of
anything that shouldn't be. Genuinely private notes belong in
`~/.claude/CLAUDE.md` on each machine, pulled in via an `@~/…` import — loaded
into context, never committed. Tradeoff: it won't sync between the two machines.

Must stay as-is:
- Settings → Pages → custom domain `keoda.cz` (writes the `CNAME` file — don't
  edit that file by hand)
- Settings → Pages → Enforce HTTPS

DNS at WEDOS (the owner spells it Vedos). **Measured 2026-09-11, and it is not
what this file used to say** — the two hostnames take different paths:

| hostname | resolves to | what it does |
| --- | --- | --- |
| `keoda.cz` | `185.8.237.5`, `.6` | **WEDOS Global CDN → GitHub Pages** |
| `www.keoda.cz` | CNAME `keodacz.github.io` | GitHub **301 → the apex** |

So the apex is **proxied through WEDOS**, not pointed at GitHub's own
185.199.108–111.153 as this file claimed from its very first commit — that line
was written before the domain existed and describes the plan, not what was
configured.

**How it got that way, from the owner's WEDOS panel 2026-09-11:** he did set
the four GitHub A records. Activating **WEDOS Global Protection** then scanned
the domain, saved those four IPs as the *origin* ("Naskenované DNS záznamy …
uložíme jako cílové adresy WEDOS Global" — the panel still lists exactly
185.199.108–111.153), and replaced the public A records with WEDOS's own proxy
addresses. It left the `www` CNAME alone, which is why the two hostnames
differ. Nothing was misconfigured; the change was WEDOS's, on activation.

**Decision 2026-09-11: keep it, accept the delay, and do not pay to fix it.**

The delay is the only measurable cost, and the obvious lever turned out not to
be one. Tested on the live site: the owner switched **CDN Cache off** and
requested a purge, and over three and a half minutes of sampling
`cache-control` still read `max-age=600, stale-while-revalidate=3600,
stale-if-error=86400` and `x-cdn-cache-status` still said `HIT`. So the
proxy adds that header regardless of the caching settings.

That is also the argument against upgrading: the paid **Doba držení CDN cache**
sits in the same section we just proved does not control this header, so paying
would be a gamble on top of poor value. Leave CDN Cache off — it costs nothing
and stops WEDOS holding its own copy.

**PoW výzva** is the other thing in that panel worth knowing: *Vynutit PoW pro
veškerý provoz* is off, which is why visitors and crawlers sail through, but
AUTO AI still challenges what it judges suspicious — which is what a bare Node
`fetch` runs into. Correct behaviour; leave it.

Practical consequence: to confirm something is live, append a query string.
Disabling protection to make publishing instant is the only real alternative,
and it trades DDoS cover for a delay that mostly inconveniences the owner
checking his own site — new visitors hold no stale copy.

**`www` is not a way round the proxy.** It reaches GitHub directly but answers
`301 → https://keoda.cz/…`, so the page itself still comes through WEDOS. A
query string is the only reliable bypass.

WEDOS terminates TLS itself (Let's Encrypt, `CN=keoda.cz`) and rewrites
response headers, so it is a full HTTP reverse proxy, not a DNS-level
redirect.

Consequences, both verified rather than assumed:

- **The extra caching is WEDOS's, not GitHub's.** GitHub Pages alone sends
  `cache-control: max-age=600`. Through `keoda.cz` the response carries
  `max-age=600, stale-while-revalidate=3600, stale-if-error=86400` plus
  `x-cdn-cache-status` and `x-proxy-cache`. See the CMS-edit note below — an
  earlier version of it blamed GitHub and said nothing could be done, which
  was wrong.
- **WEDOS Global Protection challenges scripted clients.** A bare Node `fetch`
  gets a 401 "WEDOS.protection – Security verification" HTML page; curl and
  anything with a browser user-agent get through. Tooling that checks the live
  site must send a real user-agent. Link-preview crawlers are **not** affected
  — Discordbot, Googlebot, Twitterbot and facebookexternalhit all get 200 with
  the og tags, tested 2026-09-11.

If WEDOS webhosting or WebSite is ever ordered it will overwrite these DNS
records with their own — simplest not to order it.

### A CMS edit takes a few minutes to appear, and that is not a bug

Measured 2026-09-10, because the owner reported his exception showing on the
homepage but not on `/kalendar` even after Ctrl+Shift+R, while an incognito
window was correct.

Every page is served with `max-age=600, stale-while-revalidate=3600,
stale-if-error=86400`, so past the ten-minute freshness window the browser and
the CDN **serve the stale copy and revalidate behind it** — one request gets
the old page and the next gets the new one. Proved on one URL seconds apart:
plain request `last-modified 13:54:33`, `age 604`, old content; same URL with
`?cb=…`, `last-modified 14:10:50`, `age 0`, new content. Appending any query
string bypasses it when you need to confirm something immediately.

**Correction, 2026-09-11: this first said the headers "come from Pages and
cannot be overridden", and that was wrong.** GitHub Pages alone sends only
`max-age=600` — verified against `keodacz.github.io` directly. The
`stale-while-revalidate=3600` and `stale-if-error=86400` are added by **WEDOS
Global CDN**, which the apex domain is proxied through (see DNS above). So
there *is* a lever — a purge or a shorter TTL in the WEDOS panel — and it
belongs to the owner, not to this repo. (`www.keoda.cz` is **not** a way round
it: GitHub answers that host with a 301 to the apex, so the page still comes
through WEDOS. A query string remains the only reliable bypass.)

The build and deploy were correct throughout; none of this was ever a bug here.

Do **not** "solve" this by fetching `exceptions.json` in the browser and
re-rendering rows: that is a lot of machinery for a ten-minute delay and it
would make a build input into a runtime fetch.

### Dev server caveat

`astro dev` serves no CSS in the HTML at all — Vite injects it from
JavaScript. A long-running dev server can therefore keep a **stale copy of a
component style** while the markup is current: the scope hash
(`data-astro-cid-*`) does not change when a file is edited, so nothing looks
wrong, but the rules are the previous version. Symptom: layout differs between
localhost and the deployed site, with the deployed one correct.

Restart the dev server before believing a local-only layout bug. `npm run build`
is the honest check — it produces the same CSS the site ships.

## Two-machine workflow

- `git pull` before starting, `git push` before finishing. Always.
- Session transcripts are local per machine and do **not** sync. This file is the
  shared memory. When a decision is made, write it here.
- Ask before adding globally-installed tooling; the other machine may not have it.

## Donations (future)

Blocked on Czech legal/tax setup (živnost), not on anything technical.
Do not build a custom payment flow.

1. Fourthwall donation page on `donate.keoda.cz` (custom domains are free on all
   plans; Fourthwall takes 0%, only card fees apply)
2. `keoda.cz/donation` is a styled page in this repo with a button pointing there.
   Our URL, their payment form, no secrets here.
3. OBS alerts via Streamer.bot's built-in Fourthwall integration, which has a
   dedicated Fourthwall Donation trigger. Runs on the owner's PC, receives signed
   webhooks directly. Nothing hosted, no secret in this repo.

Note: Fourthwall's StreamElements/Streamlabs integration covers purchases and
memberships only, **not** donations. Streamer.bot is the right tool.

## Open questions

- [x] Last VOD / latest clip on the homepage — **done 2026-09-10** as
      "Co si pustit" (see Pages). It landed full width under the panels rather
      than as a card beside the calendar, which is what the 2026-09-07 note
      asked for; the measurements that decided it are recorded there.

- [ ] Do we want `kontakt@keoda.cz`? (needs Vedos mailhosting + MX records)
- [ ] Move the data-fetching subsections to `.claude/rules/` once the pipeline
      works — see the maintenance note under Data layer
- [ ] News section — only if the owner actually starts writing news
- [ ] Clip embeds on-page, or thumbnail + link out? Embeds need `&parent=keoda.cz`
      (plus `www` and `localhost`) or they fail silently as a black box. Start with
      thumbnails.
- [ ] Store, or donations only?
