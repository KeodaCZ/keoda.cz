/**
 * Checks that credentials cannot reach printed output. Run: npm test
 *
 * The scenario this guards is mundane and likely: the fetch scripts now run
 * locally from a .env, something fails, and the output gets pasted into a chat
 * or an issue. The YouTube key rides in the query string, so a network-layer
 * error can carry the whole URL.
 */
import { scrub } from '../scripts/lib/secrets.mjs';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const KEY = 'AIzaFAKE0123456789abcdefghij';
const SECRET = 'twitchfakesecret0123456789';
const CLIENT_ID = 'twitchfakeclientid0123456';

const withEnv = (env, fn) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
};

withEnv({ YOUTUBE_API_KEY: KEY, TWITCH_CLIENT_SECRET: SECRET, TWITCH_CLIENT_ID: CLIENT_ID }, () => {
  check(
    'a key inside a URL is hidden',
    scrub(`fetch failed: https://www.googleapis.com/youtube/v3/videos?id=x&key=${KEY}`),
    'fetch failed: https://www.googleapis.com/youtube/v3/videos?id=x&key=«skryto»',
  );
  check('a bare key is hidden', scrub(KEY), '«skryto»');
  check('a twitch secret is hidden', scrub(`body: client_secret=${SECRET}&grant_type=x`), 'body: client_secret=«skryto»&grant_type=x');
  check(
    'every occurrence, not just the first',
    scrub(`${KEY} ... ${KEY}`),
    '«skryto» ... «skryto»',
  );
  check(
    'both credentials in one string',
    scrub(`key=${KEY} secret=${SECRET}`),
    'key=«skryto» secret=«skryto»',
  );

  // The client id is not a credential — it is sent to browsers in ordinary
  // OAuth flows — and hiding it would only make errors harder to read.
  check('the client id is left readable', scrub(`Client-Id: ${CLIENT_ID}`), `Client-Id: ${CLIENT_ID}`);

  check('ordinary text is untouched', scrub('Twitch token selhal: HTTP 400'), 'Twitch token selhal: HTTP 400');
  check('non-strings survive', scrub(undefined), '');
  check('numbers survive', scrub(404), '404');
});

// With nothing set there is nothing to hide, and scrub must not mangle output.
withEnv({ YOUTUBE_API_KEY: '', TWITCH_CLIENT_SECRET: '' }, () => {
  check('no credentials means no substitution', scrub('https://example.com/?key=abc'), 'https://example.com/?key=abc');
});

// A short or placeholder value must not turn every message into markers.
withEnv({ YOUTUBE_API_KEY: 'x', TWITCH_CLIENT_SECRET: 'ab' }, () => {
  check(
    'a too-short value is ignored rather than matching everywhere',
    scrub('exit code 1, x marks nothing, ab neither'),
    'exit code 1, x marks nothing, ab neither',
  );
});

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} secret-scrubbing checks passed.`);
