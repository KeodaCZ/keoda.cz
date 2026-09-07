/**
 * Twitch Helix access for the fetch scripts. No dependencies — Node's own
 * fetch is enough, and this has to run from a clean clone.
 *
 * Authentication is client_credentials, which yields an *app* access token:
 * no user scope, so it can only read public data and cannot touch the owner's
 * channel even if the credentials leaked.
 */

/** Numeric channel id. Twitch needs the id, not the login name, on most calls. */
export const BROADCASTER_ID = '165181355';
export const BROADCASTER_LOGIN = 'keodacz';

const HELIX = 'https://api.twitch.tv/helix';

export function credentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Chybí TWITCH_CLIENT_ID nebo TWITCH_CLIENT_SECRET.');
  }
  return { clientId, clientSecret };
}

export async function getAppToken() {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
  if (!response.ok) {
    // Never echo the body: it can quote back what was sent.
    throw new Error(`Twitch token selhal: HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data.access_token) throw new Error('Twitch token: odpověď bez access_token.');
  return data.access_token;
}

/** One Helix GET. Returns the parsed body; throws with the status on failure. */
export async function helix(token, path, params = {}) {
  const { clientId } = credentials();
  const url = new URL(`${HELIX}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
    else url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
  });

  if (response.status === 429) {
    throw new Error('Twitch: rate limit (429). Zkus to později.');
  }
  if (!response.ok) {
    throw new Error(`Twitch ${path}: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Follows Helix cursor pagination, with a hard page cap.
 *
 * The cap is not defensiveness for its own sake: Helix pagination on clips
 * tops out around 1,000 results, and a cursor that stops advancing would
 * otherwise loop forever inside a scheduled job.
 */
export async function helixAll(token, path, params = {}, { maxPages = 25 } = {}) {
  const out = [];
  let cursor;
  let pages = 0;

  while (pages < maxPages) {
    const page = await helix(token, path, { ...params, first: 100, after: cursor });
    out.push(...(page.data ?? []));
    pages += 1;

    const next = page.pagination?.cursor;
    if (!next || next === cursor || (page.data ?? []).length === 0) break;
    cursor = next;
  }

  return { items: out, pages, hitCap: pages >= maxPages };
}

/**
 * Confirms the hardcoded id still belongs to the expected login.
 *
 * Worth a request per run: a wrong id does not fail, it quietly returns
 * somebody else's clips, and nobody would notice for months.
 */
export async function assertBroadcaster(token) {
  const { data } = await helix(token, 'users', { id: BROADCASTER_ID });
  const user = data?.[0];
  if (!user) throw new Error(`Twitch: id ${BROADCASTER_ID} neexistuje.`);
  if (user.login !== BROADCASTER_LOGIN) {
    throw new Error(
      `Twitch: id ${BROADCASTER_ID} patří "${user.login}", čekal jsem "${BROADCASTER_LOGIN}". ` +
        'Nezapisuj nic a oprav BROADCASTER_ID.',
    );
  }
  return user;
}

/**
 * Resolves game ids to names, 100 per request as Helix allows.
 * Clips carry only `game_id`, and the name is the fallback when a clip title
 * is useless — which Twitch's own docs warn is common.
 */
export async function gameNames(token, gameIds) {
  const unique = [...new Set(gameIds.filter(Boolean))];
  const names = new Map();

  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await helix(token, 'games', { id: unique.slice(i, i + 100) });
    for (const game of data ?? []) names.set(game.id, game.name);
  }

  return names;
}

/** Helix clip -> our record. Only fields that never churn (see clips-store). */
export function toRecord(clip, names) {
  const record = {
    id: clip.id,
    title: (clip.title ?? '').trim(),
    createdAt: clip.created_at,
    creator: clip.creator_name ?? '',
    duration: clip.duration,
    thumb: clip.thumbnail_url ?? '',
    url: clip.url ?? `https://clips.twitch.tv/${clip.id}`,
  };

  const game = names.get(clip.game_id);
  if (game) record.game = game;
  if (clip.is_featured) record.featured = true;

  return record;
}
