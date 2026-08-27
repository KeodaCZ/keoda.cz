// @ts-check
import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages as a *project* site until the keoda.cz domain is
// purchased, so the site lives under the /keoda.cz/ base path.
//
// When the custom domain is attached (see CLAUDE.md → Hosting architecture):
//   1. change `site` to 'https://keoda.cz'
//   2. delete the `base` line entirely
export default defineConfig({
  site: 'https://keodacz.github.io',
  base: '/keoda.cz',
});
