---
paths:
  - "scripts/*"
  - "scripts/**/*"
  - ".github/workflows/*"
  - ".github/workflows/**/*"
  - "test/clips-store.test.mjs"
  - "test/youtube.test.mjs"
  - "test/backfill-windows.test.mjs"
  - "test/secrets.test.mjs"
---

<!--
Written out rather than using brace expansion on purpose: this machine runs
Claude Code 2.1.211, and brace groups in `paths` were only made safe at
startup in 2.1.217. Four literal filenames cost nothing.

Both `scripts/*` and `scripts/**/*` are listed for the same reason — belt and
braces on whether `**` is allowed to match zero directory segments, which
decides whether a file sitting directly in `scripts/` is covered. Verified by
reading one file from each depth; see the note at the bottom.
-->


# Fetching the content data

Moved out of `CLAUDE.md` on 2026-09-10, once all three jobs had run for real.
These are API gotchas and script conventions: worth carrying while touching the
fetch scripts or the workflows, dead weight in every other session. `CLAUDE.md`
keeps what the whole site needs — the `data/` file list, the schedule rules, and
why the archive is JSON.

> **This file does not load itself.** The `paths:` frontmatter above is correct
> and its globs are verified, but on-demand instruction loading does not work
> in the owner's setup — tested 2026-09-11, and a nested `scripts/CLAUDE.md`
> failed identically, so it is the mechanism and not this file. `CLAUDE.md`
> therefore carries a standing instruction to read this before touching these
> files. If you are reading it because you opened a script and it appeared on
> its own, the mechanism has started working — say so, and that note can go.

The four listed test files are here too, on top of the two directories the
original note named: they *are* the fetch logic's other half, and someone
editing `clips-store.test.mjs` needs the same context as someone editing the
script it covers.

All external content is pulled by GitHub Actions and committed as JSON. The site
never calls an API at runtime.

## Running the fetches locally

`npm run fetch:youtube`, `npm run fetch:clips`, `npm run clips:backfill`,
`npm run clips:reconcile`.

Each is `node --env-file-if-exists=.env …`, so the same command reads a local
`.env` here and takes the values from Secrets in Actions — the workflows call
these npm scripts, so what gets tested locally is literally what CI runs. No
dependency for it; Node 24 reads env files itself.

`.env` is gitignored (along with `.env.*`), and the ignore rule went in before
the file ever existed. Never commit it.

**Local credentials must be separate from the ones in Secrets.** Twitch's own
docs: "Getting a new secret invalidates the previous secret" — so regenerating
on the existing app would leave the Actions secret dead and the pipeline
failing silently. Register a second application instead. A second YouTube API
key in the same project is fine; keys don't interfere.

Errors print one scrubbed line (`DEBUG=1` adds the stack). `scrub()` in
`scripts/lib/secrets.mjs` strips the API key and the client secret from
anything printed, because the YouTube key rides in the query string and a
network-layer failure can carry the whole URL into an error — which then gets
pasted somewhere. Tested. The Twitch *client id* is deliberately left readable:
it is not a credential, and hiding it only makes errors harder to read.

Use `process.exitCode`, not `process.exit()`, in these scripts: exiting while a
fetch is in flight trips a libuv assertion on Windows and returns 127, which in
CI reads as "command not found".

## Actions Secrets

Names are fixed so the scripts and the setup cannot drift: `YOUTUBE_API_KEY`,
`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`. Repository secrets, **not** Actions
*variables* — variables are unencrypted and shown in plain text in the UI and
logs.

Both credentials are read-only against public data: a YouTube API key does no
account operations at all, and a `client_credentials` token carries no user
scope, so neither can touch the owner's channels even if it leaked. Recovery is
regenerating in the respective console.

## YouTube

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

**Date a stream from `actualStartTime`, and skip one that is still running.**
Two overnight bot commits rewrote the same recording — `publishedAt` moved
17:12:30 → 21:53:24 and the thumbnail `_live.jpg` → `.jpg` — because YouTube's
metadata for a live broadcast is provisional until it ends. One run fired three
seconds after `actualEndTime`, so the `_live` thumbnail is the stronger second
signal: `isStillLive()` checks both.

## Twitch clips

`helix/clips?broadcaster_id=<id>`. App access token via `client_credentials` —
no user scope needed.

- Use the **numeric** `broadcaster_id`, not the login name. Fetched once via
  `Get Users?login=keodacz` and hardcoded in `scripts/lib/twitch.mjs`.
  `assertBroadcaster()` re-checks it every run, which is worth a request: a
  wrong id does not fail, it quietly returns somebody else's clips.
- Clips do **not** expire, unlike VODs — worth archiving permanently.
- Results are ordered by **view count**, never chronologically. Owner wants
  **recent** clips: fetch a date window, then sort by `created_at` yourself.
- Widen the window if sparse: try 30 days, and if under ~8 results retry at
  90 then 365, so the section is never empty during quiet periods.
- `started_at`/`ended_at` only work alongside `broadcaster_id` or `game_id`.
  If `ended_at` is omitted the range defaults to one week.
- `Get Clips?id=` is capped at **100 ids per request**.

Field gotchas:

- `title` is often useless (Twitch's own docs warn about this; auto-titles like
  "a" are common). Allow a manual title override; fall back to game name.
- Don't build on `video_id` / `vod_offset` — both go empty/null once the source
  VOD expires, which is most of the archive.
- `is_featured` exists and drives a badge, never the ordering.

## Full archive: merge, don't overwrite

There is no "get all clips" call — the API caps pagination at roughly 1,000
results and the documented workaround is paging over separate `started_at` /
`ended_at` windows. So:

- The scheduled job **merges**: read existing JSON, append unseen IDs, write back.
  The repo is the database.
- Write the merge logic from the start. Overwrite-style code is what gets written
  by default and it silently destroys the archive.
- Both writing scripts carry the same guard: if the archive would come out
  smaller than it went in, throw and write nothing.

**Backfill, done 2026-09-08.** `scripts/backfill-clips.mjs`
(`npm run clips:backfill`) walks month windows back to channel start and merges.
Two things it deliberately does not guess:

- The floor is the channel's own `created_at` from `Get Users` — 2017-07-17, so
  110 windows — not a year typed into the script. A guess that is too recent
  loses clips with no error anywhere.
- A window that hits the pagination cap is **split in half and retried**.
  Results come back by view count, so a capped window loses an arbitrary slice
  rather than the oldest.

Result: 31 → **471 clips**, 2023-02-25 to 2026-09-06 (2023: 27, 2024: 157,
2025: 156, 2026: 131). Twitch's clip manager says ~475; the four missing are
presumably deleted. Re-running found 0 new and wrote nothing, which is the merge
behaving as designed — it is safe to run again.

`monthWindows` is exported and unit-tested (`test/backfill-windows.test.mjs`)
because a gap between two windows is invisible — it is just clips that never
appear, from a script reporting success.

## Reconciliation (deleted clips)

Merge-only would keep deleted clips forever as dead links. Weekly job
(`reconcile.yml`, `15 4 * * 1` — Monday 04:15 UTC):

- Batch archive IDs into `Get Clips?id=…`, **max 100 IDs per request**. Anything
  absent from the response no longer exists. 471 clips = 5 requests.
- **Soft delete**: set `removed: true`, keep the record. Never delete the line.
  Unmark if it reappears.
- Judge only the ids a run actually asked about. A batch that threw would
  otherwise read as a batch full of deletions.
- **Safety valve**: if a run reports more than ~20% of the previously-present
  clips missing, abort without committing. That's an API failure, not mass
  deletion. The ratio counts newly-missing against previously-present, not
  against the whole archive — measuring against the whole archive would creep
  upward as legitimate removals accumulate until every run tripped the valve.

This job is also **the only place view counts are written**. It already asks
about every clip by id and the answer carries `view_count` regardless, so it is
free here and would be daily churn in the nightly fetch. `shouldUpdateViews`
holds the threshold; see *Filtering and sorting* in `CLAUDE.md` for why the site
needs the ranking rather than the number.

## Workflow schedule

- **Content** (`content.yml`): once nightly, `cron: '0 3 * * *'` — 03:00 UTC,
  plus `workflow_dispatch`. Owner's call 2026-09-08: clips do not need to be up
  seconds after a stream, and the manual button covers wanting one right now.
  **03:00 UTC and not earlier is the point** — he occasionally streams until
  3am at weekends, and asked for nothing before 04:00 Prague. 03:00 UTC is
  05:00 Prague in summer and 04:00 in winter, so even the nominal time clears
  it, and the delay below only ever pushes it later.
- **Reconciliation** (`reconcile.yml`): weekly, Monday 04:15 UTC.
- **Deploy** (`deploy.yml`): on push, plus `20 22` and `20 23` UTC so "Dnes"
  rolls over in weeks with no commits, plus `workflow_run` on the two content
  workflows to cross the `GITHUB_TOKEN` boundary.

Actions cron caveats:

- 5-minute minimum interval. **Delays measured on this repo are one to four
  hours**, not the 5–30 minutes usually quoted — ten consecutive nights of the
  deploy cron fired 1h35m to 2h06m late, and content runs up to 4h30m late.
  Never schedule anything here that needs to happen at a particular time; if
  correctness depends on the clock, resolve it in the browser instead (as the
  calendar and the schedule banner do).
- **Scheduled workflows auto-disable after 60 days without commits.** The job's
  own commits reset this while content flows, but a quiet spell kills it
  silently. Already handled: `keepalive.yml` (see Deployment in `CLAUDE.md`).
- A push by `GITHUB_TOKEN` does not trigger other workflows. That is why the
  content workflows are wired to the deploy with `workflow_run`, and why the
  keepalive cannot cause a deploy loop.

<!--
Verification of the `paths` list, 2026-09-10. Checked with Node's own
`globSync` against the real tree: the eight patterns cover 17 files, including
`scripts/fetch-clips.mjs` (directly in the directory), `scripts/lib/twitch.mjs`
(nested), `.github/workflows/content.yml` and the four test files, and they do
not reach `src/`. Both `scripts/*` and `scripts/**/*` matched the file sitting
directly in `scripts/`.

Not verified from the session that wrote this file: whether Claude Code loads
it. That session began before `.claude/rules/` existed, and reading a matching
file did not pull the rule in — consistent with rule discovery happening at
launch. If it is still missing from `/context` in a fresh session after opening
one of these files, the documented next step is the `InstructionsLoaded` hook,
which logs which instruction files load and why.
-->

