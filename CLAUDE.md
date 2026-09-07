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

**Live status**: no build-time badge, ever — Actions cron can't do it (see
Workflow schedule) and a real one would need a Worker. What exists instead is a
client-side check in `TwitchEmbed.astro`, described below: player when live,
one-line strip when offline. Nothing else on the site may claim live status,
because nothing else can know it.

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

> **Maintenance task — Claude Code, act on this without being asked.**
>
> Trigger: the YouTube fetch, the Twitch clips fetch, and the reconciliation job
> all exist and have each run successfully at least once.
>
> Then move these subsections out of this file into
> `.claude/rules/data-fetching.md`, path-scoped so they load only when working on
> the fetch scripts or workflows (roughly `scripts/**` and
> `.github/workflows/**`):
>
> - YouTube
> - Twitch clips
> - Full archive: merge, don't overwrite
> - Reconciliation (deleted clips)
> - Workflow schedule
>
> **Keep in this file** (they inform work across the whole site, not just the
> scripts): the Files list, Schedule, and Why JSON and not a database.
>
> Check the current Claude Code docs for the exact frontmatter syntax for
> path-scoped rules rather than guessing it. Leave a one-line pointer here saying
> where the content went. Tell the owner you've done it; don't do it silently.
>
> Why: this file loads into context at the start of every session. The API
> gotchas below are worth carrying while the pipeline is being built, and dead
> weight once it works. Target for this file is under ~200 lines.

All external content is pulled by GitHub Actions and committed as JSON. The site
never calls an API at runtime.

### Files

```
data/youtube.json        videos + shorts + stream archive
data/clips/2025.json     Twitch clips, split by year
data/clips/2026.json
data/hidden.json         hand-edited: IDs the site always skips
data/featured.json       hand-edited: manually pinned items
data/schedule.json       hand-edited: recurring stream pattern
data/exceptions.json     CMS-edited: dated overrides
```

**Generated files are never hand-edited.** Manual curation goes in
`featured.json` / `hidden.json` only. This is deliberate: the owner will forget to
add things manually, so automation must be the only path in.

### YouTube

One fetch, three buckets. `channels.list` → uploads playlist → `playlistItems.list`
→ `videos.list` with `contentDetails,liveStreamingDetails`:

- `liveStreamingDetails` present → it was a livestream → stream archive
- duration <= 180s → Short
- otherwise → regular video

Owner multistreams to YouTube, so YouTube is the canonical stream archive. Do not
pull Twitch VODs: they expire (7 days base / 14 Affiliate / 60 Partner+Turbo+Prime),
so any Twitch-sourced history rots.

Quota is a non-issue: 10,000 units/day, these calls cost 1 unit each.

Shorts have no official API flag. Duration is a heuristic with one known trap: a
vertical video **longer** than 3 min is classified by YouTube as a regular video.
Support a manual override list.

### Twitch clips

`helix/clips?broadcaster_id=<id>`. App access token via client_credentials —
no user scope needed. Client ID + Secret in Actions Secrets.

- Use the **numeric** `broadcaster_id`, not the login name. Fetch once via
  `Get Users?login=keodacz` and hardcode it.
- Clips do **not** expire, unlike VODs — worth archiving permanently.
- Results are ordered by **view count**, never chronologically. Owner wants
  **recent** clips: fetch a date window, then sort by `created_at` yourself.
- Widen the window if sparse: try 30 days, and if under ~8 results retry at
  90 then 365, so the section is never empty during quiet periods.
- `started_at`/`ended_at` only work alongside `broadcaster_id` or `game_id`.
  If `ended_at` is omitted the range defaults to one week.

Field gotchas:
- `title` is often useless (Twitch's own docs warn about this; auto-titles like
  "a" are common). Allow a manual title override; fall back to game name.
- Don't build on `video_id` / `vod_offset` — both go empty/null once the source
  VOD expires, which is most of the archive.
- `is_featured` exists and can drive a highlights row.

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

### Full archive: merge, don't overwrite

There is no "get all clips" call — the API caps pagination at roughly 1,000
results and the documented workaround is paging over separate `started_at` /
`ended_at` windows. So:

- The scheduled job **merges**: read existing JSON, append unseen IDs, write back.
  The repo is the database.
- A one-off backfill script walks month-sized windows back to channel start. Run
  locally once, commit the result.
- Write the merge logic from the start. Overwrite-style code is what gets written
  by default and it silently destroys the archive.

### Reconciliation (deleted clips)

Merge-only would keep deleted clips forever as dead links. Weekly job:

- Batch archive IDs into `Get Clips?id=…`, **max 100 IDs per request**. Anything
  absent from the response no longer exists. 1,000 clips = 10 requests.
- **Soft delete**: set `removed: true`, keep the record. Never delete the line.
  Unmark if it reappears.
- **Safety valve**: if a run reports more than ~20% of the archive missing, abort
  without committing. That's an API failure, not mass deletion.

### Workflow schedule

- Incremental add: every 6h, `cron` + `workflow_dispatch` (manual button, needed
  for same-day removals).
- Reconciliation: weekly.

Actions cron caveats:
- 5-minute minimum interval; delays of 5–30 min are common. Fine for content,
  useless for live status.
- **Scheduled workflows auto-disable after 60 days without commits.** The job's own
  commits reset this while content flows, but a quiet spell kills it silently. Add
  a keepalive step.

## Why JSON and not a database

Deliberate, not a limitation. JSON diffs line-by-line so the repo stays small and
history stays readable; a committed SQLite file is a binary blob that rewrites
whole on every commit. Version history, offline access, both machines, zero cost,
nothing to authenticate against.

Size is a non-worry: ~250 bytes per clip record, and it's a **build input** —
Astro renders it to HTML, visitors never download it. Only client-side search
would need data in the browser, and a stripped id+title+date index covers that.

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

**Kalendář** (`/kalendar`) — the full schedule, arcadebulls-style rows with an
add-to-calendar menu per stream (Google Calendar link + a real `.ics` file built
at `/ics/<date>.ics`). The homepage carries only a **compact** version
(`ScheduleCompact.astro`) plus a link through; the full rows live on their own
page. Deliberately no per-row "notify me" — notifications would need accounts,
and a button that just links to Twitch was rejected as useless.

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
> Blocked on two things only he has:
> - **the OBS plugin list** — the concrete gap against the nutty reference
> - anything missing from the gear list entirely: Elgato devices (Stream Deck?),
>   mic arm, mixer, monitors
>
> The first guide was to be **multistreaming via Aitum** (Twitch + YouTube at
> once) — his most distinctive setup, and why YouTube is the canonical stream
> archive. He declined to write it on 2026-09-07 ("návod psát nechci když to
> nevidím před sebou"), so build the page shell first and let him react to
> something concrete rather than asking for prose up front.

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
- A site-wide "Ve výstavbě" strip sits under the header, outline only so it
  does not compete with the yellow schedule banner below it.
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
- Site progress so far: homepage (socials row, compact schedule, gear teaser),
  `/kalendar`, `/vybaveni`, the Twitch player, and the CMS at `/admin`.
  Next up: guides, then the data pipeline (YouTube + clips).
- Times converted to UTC for calendar exports only, in
  `src/lib/calendar-links.ts`, with the offset resolved per date — 18:30 Prague
  is 16:30Z in summer but 17:30Z in winter. Covered by tests.

## Deployment

Push to `main` → Pages publishes. No FTP. Tests run first; a failure blocks
the deploy.

The schedule is rendered at build time, so the deploy workflow also runs on cron
at 22:20 and 23:20 UTC — one of the two lands just after midnight in Prague in
either DST regime, so "Dnes" rolls over in weeks with no commits. Watch the
60-day auto-disable rule (see Workflow schedule); a keepalive lands with the
data pipeline.

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

DNS at Vedos: four A records to GitHub Pages (185.199.108–111.153), CNAME for
`www`. If Vedos webhosting or WebSite is ever ordered it will overwrite these with
their own — simplest not to order it.

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

- [ ] Last VOD / latest clip as a **card next to the calendar** — owner's call
      2026-09-07, when the offline strip was built. Explicitly *not* in the
      player's slot: that stays the one-line status. Blocked on the data
      pipeline (`data/youtube.json`, `data/clips/*.json`), so it lands with it.
      Exact placement still open — beside `ScheduleCompact` on the homepage, or
      wherever it earns the space once there is real data to show.

- [ ] Do we want `kontakt@keoda.cz`? (needs Vedos mailhosting + MX records)
- [ ] Move the data-fetching subsections to `.claude/rules/` once the pipeline
      works — see the maintenance note under Data layer
- [ ] News section — only if the owner actually starts writing news
- [ ] Clip embeds on-page, or thumbnail + link out? Embeds need `&parent=keoda.cz`
      (plus `www` and `localhost`) or they fail silently as a black box. Start with
      thumbnails.
- [ ] Store, or donations only?
