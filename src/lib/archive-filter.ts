/**
 * Filtering, sorting and paging for the archive pages — pure, so it can be
 * unit-tested without a browser and reused by the client script.
 *
 * All of this runs in the visitor's browser, which is the resolution to what
 * looked like a contradiction: a static site cannot filter server-side, but it
 * does not have to. The build ships every item; the browser decides which ones
 * to show. Client-side paging is the other half — without it, filtering would
 * mean one endless page that grows with every stream, which is worse than no
 * filter at all.
 */

/** What the logic needs to know about an item. The DOM node carries the rest. */
export interface Filterable {
  /** Pre-normalised searchable text — see `searchKey`, built at build time. */
  key: string;
  /** ISO timestamp or date. Only the first 10 characters are used. */
  date: string;
  views?: number;
  /** 'videa' | 'shorts' on /videa; absent elsewhere. */
  kind?: string;
}

export type SortOrder = 'nejnovejsi' | 'nejstarsi' | 'nejsledovanejsi';

export interface FilterState {
  q: string;
  /** YYYY-MM-DD, inclusive. Empty means open-ended. */
  from: string;
  to: string;
  order: SortOrder;
  /** Empty means every kind. */
  kind: string;
  /** 1-based. Only meaningful while a filter is active. */
  page: number;
}

export const DEFAULT_STATE: FilterState = {
  q: '',
  from: '',
  to: '',
  order: 'nejnovejsi',
  kind: '',
  page: 1,
};

const ORDERS: SortOrder[] = ['nejnovejsi', 'nejstarsi', 'nejsledovanejsi'];

/**
 * Normalises text for searching: lowercase, no diacritics, single spaces.
 *
 * Stripping diacritics is not tidiness — it is the difference between the
 * search being usable and not. Czech titles are full of them and nobody types
 * "záznam" with the acute when they are looking for something; typing "zaznam"
 * has to find it. Decomposing to NFD and dropping the combining marks does
 * that without a lookup table.
 */
export function searchKey(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a normalised key matches a query.
 *
 * Every word has to appear, in any order and anywhere — so "dbd chill" finds
 * "Chill v DbD". An AND of substrings rather than one phrase, because with
 * titles this varied a phrase match would almost always come back empty and
 * read as broken.
 */
export function matches(key: string, query: string): boolean {
  const words = searchKey(query).split(' ').filter(Boolean);
  return words.every((word) => key.includes(word));
}

/** Inclusive at both ends; an empty bound is open. Dates compare as strings. */
export function withinRange(date: string, from: string, to: string): boolean {
  const day = (date ?? '').slice(0, 10);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Whether the state is the view the server already rendered.
 *
 * `page` is excluded on purpose: paging is the server's job while nothing is
 * filtered, and the client's once something is. That split is what keeps the
 * two pagers from ever both being live.
 */
export function isDefault(state: FilterState): boolean {
  return (
    state.q.trim() === '' &&
    state.from === '' &&
    state.to === '' &&
    state.kind === '' &&
    state.order === DEFAULT_STATE.order
  );
}

/**
 * Sorts a copy. `nejsledovanejsi` falls back to the date for items with no
 * view count, so a partly-populated archive still comes out in a sensible
 * order rather than clumping the unknowns at one end.
 */
export function sortItems<T extends Filterable>(items: T[], order: SortOrder): T[] {
  const out = [...items];

  if (order === 'nejsledovanejsi') {
    out.sort(
      (a, b) => (b.views ?? -1) - (a.views ?? -1) || b.date.localeCompare(a.date),
    );
    return out;
  }

  const sign = order === 'nejstarsi' ? -1 : 1;
  out.sort((a, b) => sign * b.date.localeCompare(a.date));
  return out;
}

/** Filter then sort. Does not page — that is the caller's next step. */
export function selectItems<T extends Filterable>(items: T[], state: FilterState): T[] {
  const query = state.q.trim();

  const kept = items.filter((item) => {
    if (state.kind && item.kind !== state.kind) return false;
    if (!withinRange(item.date, state.from, state.to)) return false;
    if (query && !matches(item.key, query)) return false;
    return true;
  });

  return sortItems(kept, state.order);
}

/** Page size 0 means "no paging" — used on a page small enough not to need it. */
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, size: number): number {
  const last = pageCount(total, size);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), last);
}

export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  if (size <= 0) return items;
  const safe = clampPage(page, items.length, size);
  return items.slice((safe - 1) * size, safe * size);
}

/**
 * The state as URL parameters, in Czech to match every other visible string,
 * and **only the parts that differ from the default** — so a shared link
 * carries no noise and the default view keeps a clean URL.
 */
export function stateToParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set('q', q);
  if (state.from) params.set('od', state.from);
  if (state.to) params.set('do', state.to);
  if (state.kind) params.set('typ', state.kind);
  if (state.order !== DEFAULT_STATE.order) params.set('razeni', state.order);
  if (state.page > 1 && !isDefault(state)) params.set('strana', String(state.page));
  return params;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads state back out of a URL, ignoring anything it does not recognise.
 *
 * Deliberately forgiving: these values arrive from a link someone pasted, so a
 * bad one must land on the default view rather than on an empty page that
 * looks like a broken site.
 */
export function stateFromParams(params: URLSearchParams, kinds: string[] = []): FilterState {
  const order = params.get('razeni') ?? '';
  const kind = params.get('typ') ?? '';
  const from = params.get('od') ?? '';
  const to = params.get('do') ?? '';
  const page = Number.parseInt(params.get('strana') ?? '', 10);

  return {
    q: params.get('q') ?? '',
    from: DATE.test(from) ? from : '',
    to: DATE.test(to) ? to : '',
    order: (ORDERS as string[]).includes(order) ? (order as SortOrder) : DEFAULT_STATE.order,
    kind: kinds.includes(kind) ? kind : '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** '3 klipy' — Czech needs three forms and getting it wrong is very visible. */
export function countLabel(n: number, forms: [string, string, string]): string {
  if (n === 1) return `${n} ${forms[0]}`;
  if (n >= 2 && n <= 4) return `${n} ${forms[1]}`;
  return `${n} ${forms[2]}`;
}
