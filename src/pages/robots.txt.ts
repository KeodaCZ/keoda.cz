/**
 * robots.txt. An endpoint rather than a file in public/ so the sitemap URL is
 * derived from `site` in astro.config.mjs and cannot drift from it.
 *
 * Note what Disallow does and doesn't do: it stops well-behaved crawlers
 * fetching a path, but a URL linked from elsewhere can still be listed. The
 * admin page therefore also carries its own `noindex`, which is the part that
 * actually keeps it out of results. Nothing here is a security measure —
 * /admin holds no credentials by design (see CLAUDE.md).
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://keoda.cz');

  const body = `User-agent: *
Allow: /

# The CMS. Publicly loadable by design, but there is no reason for it to be
# in search results.
Disallow: /admin/

# One calendar file per upcoming stream, rewritten on every build. Nothing to
# index, and crawling them just churns.
Disallow: /ics/

Sitemap: ${new URL('/sitemap.xml', base).href}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
