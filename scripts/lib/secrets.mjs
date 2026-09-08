/**
 * Keeps credentials out of anything the scripts print.
 *
 * This matters most when running locally from a .env: the YouTube key travels
 * in the query string, and a network-layer failure can put the whole URL into
 * an error message. Output then gets pasted into a chat or an issue, and the
 * key is out. Cheap insurance either way.
 */

/** Values worth hiding. The Twitch client id is not secret — it is sent to
 *  browsers in normal OAuth flows — so scrubbing it would only make errors
 *  harder to read. */
function secretValues() {
  return [process.env.YOUTUBE_API_KEY, process.env.TWITCH_CLIENT_SECRET].filter(
    // Guard against a stray short value turning every message into asterisks.
    (value) => typeof value === 'string' && value.length >= 8,
  );
}

/** Replaces any credential found in `text` with a marker. */
export function scrub(text) {
  let out = String(text ?? '');
  for (const value of secretValues()) out = out.split(value).join('«skryto»');
  return out;
}

/**
 * Prints a scrubbed error and marks the run as failed. Use as the last catch.
 *
 * `process.exitCode` and not `process.exit()`: killing the process while a
 * fetch is still in flight trips a libuv assertion on Windows
 * (`!(handle->flags & UV_HANDLE_CLOSING)`) and exits 127 instead of 1 — which
 * in CI reads as "command not found". Setting the code lets Node unwind and
 * exit properly, and it cannot truncate pending output either.
 *
 * Only the message by default: for the common case — wrong or missing
 * credentials — a stack trace is noise in front of the one line that matters.
 * Set DEBUG=1 for the full trace.
 */
export function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${scrub(message)}`);

  if (process.env.DEBUG && error instanceof Error && error.stack) {
    console.error(scrub(error.stack));
  }

  process.exitCode = 1;
}
