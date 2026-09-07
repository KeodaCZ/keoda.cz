/** Reading and writing the JSON data files, so every script does it the same way. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CLIPS_DIR = path.join(ROOT, 'data', 'clips');

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    // A corrupt file must stop the run, not be silently replaced with an empty
    // one — that is how an archive disappears.
    throw new Error(`${path.relative(ROOT, file)} se nedá přečíst: ${error.message}`);
  }
}

/**
 * Writes only when the content actually differs, so a scheduled run that found
 * nothing new leaves no commit behind.
 *
 * Two spaces and a trailing newline to match the hand-edited data files, and
 * so diffs stay one-change-per-line.
 */
export function writeJsonIfChanged(file, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  let current = null;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === next) return false;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}

/** Every year file in data/clips, as { '2026': {clips:[…]} }. */
export function readClipArchive() {
  const byYear = {};
  let names;
  try {
    names = fs.readdirSync(CLIPS_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') return byYear;
    throw error;
  }

  for (const name of names) {
    const match = /^(\d{4})\.json$/.exec(name);
    if (!match) continue;
    byYear[match[1]] = readJson(path.join(CLIPS_DIR, name), { clips: [] });
  }
  return byYear;
}

/** Writes back the year files that changed; returns the ones it touched. */
export function writeClipArchive(byYear) {
  const written = [];
  for (const [year, file] of Object.entries(byYear)) {
    if (writeJsonIfChanged(path.join(CLIPS_DIR, `${year}.json`), file)) written.push(year);
  }
  return written;
}

/** Ids the site must always skip, whatever the fetch says. Hand-edited. */
export function readHidden() {
  const data = readJson(path.join(ROOT, 'data', 'hidden.json'), { ids: [] });
  return new Set(data.ids ?? []);
}
