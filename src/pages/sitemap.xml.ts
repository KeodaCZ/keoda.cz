/**
 * Sitemap, built from the pages that actually exist rather than a hand-kept
 * list — add a page and it appears here on the next deploy.
 *
 * Deliberately no <lastmod>, <changefreq> or <priority>. Google ignores the
 * last two outright, and a truthful lastmod is not available: the deploy
 * workflow rebuilds on cron twice a day, so a build timestamp would claim
 * every page changed daily, which is worse than saying nothing.
 *
 * No dependency for this on purpose — @astrojs/sitemap would need filtering
 * to keep the .ics downloads and the 404 out anyway, and this is 20 lines.
 */
import type { APIRoute } from 'astro';

// Only .astro pages: the .ics endpoints are per-date downloads that are
// regenerated on every build, and have no business being crawled.
const pages = import.meta.glob('./**/*.astro', { eager: true });

/** './kalendar.astro' -> '/kalendar/', './index.astro' -> '/' */
function toRoute(file: string): string | null {
  const slug = file.replace(/^\.\//, '').replace(/\.astro$/, '');

  // Astro's own error page, and partials.
  if (slug === '404' || slug === '500') return null;

  const parts = slug.split('/');
  if (parts.some((part) => part.startsWith('_'))) return null;

  // A paginated section — './streamy/[...page]' — has its first page at the
  // parent path, so list that. Without this the sitemap silently lost
  // /streamy/ and /klipy/ the moment they became paginated, which is exactly
  // the kind of gap a glob is supposed to prevent. Later pages are reachable
  // from it by the "Starší →" links, so a crawler finds them anyway.
  const last = parts.at(-1) ?? '';
  if (/^\[\.\.\..+\]$/.test(last)) {
    const parent = parts.slice(0, -1).join('/');
    return parent ? `/${parent}/` : '/';
  }

  // Any other dynamic route cannot be enumerated from the filename.
  if (parts.some((part) => /[[\]]/.test(part))) return null;

  return slug === 'index' ? '/' : `/${slug.replace(/\/index$/, '')}/`;
}

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://keoda.cz');

  const urls = Object.keys(pages)
    .map(toRoute)
    .filter((route): route is string => route !== null)
    .sort()
    .map((route) => `  <url><loc>${new URL(route, base).href}</loc></url>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
