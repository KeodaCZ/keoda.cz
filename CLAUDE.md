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
  data is fetched at build time and committed as JSON.
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

**Live status**: deferred. Embed the Twitch player, which reports its own offline
state. A real `LIVE` badge needs a Worker (Actions cron can't do it — see below).

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
Notion, even though nutty's Notion page was the original reference for the idea.

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
  `/kalendar`, `/vybaveni`, and the CMS at `/admin`. Next up: Twitch embed.
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

- [ ] Do we want `kontakt@keoda.cz`? (needs Vedos mailhosting + MX records)
- [ ] Move the data-fetching subsections to `.claude/rules/` once the pipeline
      works — see the maintenance note under Data layer
- [ ] News section — only if the owner actually starts writing news
- [ ] Clip embeds on-page, or thumbnail + link out? Embeds need `&parent=keoda.cz`
      (plus `www` and `localhost`) or they fail silently as a black box. Start with
      thumbnails.
- [ ] Store, or donations only?
