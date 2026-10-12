/**
 * Extract and validate the CHANGELOG section used for GitHub Release notes.
 *
 * Usage:
 *   node scripts/extract-release-notes.mjs VERSION [OUT_FILE]
 *   node scripts/extract-release-notes.mjs --check-package
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readVersionFromPackage() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error(`Invalid package.json version: ${pkg.version}`);
  }
  return pkg.version;
}

/** @param {string} changelog @param {string} version */
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split('\n');
  let found = false;
  const section = [];
  for (const line of lines) {
    if (!found) {
      if (line.startsWith(`## [${version}]`)) found = true;
      continue;
    }
    if (/^## \[\d+\.\d+\.\d+\]/.test(line)) break;
    section.push(line);
  }
  if (!found) return '';

  while (section.length > 0) {
    const tail = section[section.length - 1].trim();
    if (tail === '' || tail === '---') section.pop();
    else break;
  }

  const body = section.join('\n').trim();
  return body ? `${body}\n` : '';
}

/** @param {string} notes @param {string} version */
export function validateReleaseNotes(notes, version) {
  const trimmed = notes.trim();
  if (!trimmed) {
    console.error(`::error::Add a changelog entry for ${version} before releasing.`);
    process.exit(1);
  }
  if (trimmed.length < 80) {
    console.error(
      `::error::Changelog for ${version} is too short for a release (${trimmed.length} characters). Include theme, changes, and documentation links.`,
    );
    process.exit(1);
  }
  if (!/^### Documentation\b/m.test(trimmed)) {
    console.error(
      `::error::Changelog for ${version} must include a "### Documentation" section with at least one bullet linking to updated docs (see CONTRIBUTING.md — Releasing).`,
    );
    process.exit(1);
  }
  const docStart = trimmed.search(/^### Documentation\b/m);
  const afterHeading = trimmed.slice(docStart).replace(/^### Documentation\b[^\n]*\n?/, '');
  const nextSection = afterHeading.search(/^### /m);
  const docBlock = nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);
  const bullets = docBlock.match(/^- .+/gm) ?? [];
  if (bullets.length === 0) {
    console.error(
      `::error::"### Documentation" for ${version} must list at least one "- " bullet with a doc link.`,
    );
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const checkPackage = args.includes('--check-package');
  const positional = args.filter((a) => a !== '--check-package');

  const version = checkPackage ? readVersionFromPackage() : positional[0];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage: node scripts/extract-release-notes.mjs VERSION [OUT_FILE]');
    console.error('       node scripts/extract-release-notes.mjs --check-package');
    process.exit(1);
  }

  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const notes = extractReleaseNotes(changelog, version);
  validateReleaseNotes(notes, version);

  if (checkPackage) {
    console.log(`CHANGELOG.md release section OK for ${version} (${notes.trim().length} characters).`);
    return;
  }

  const outFile = positional[1];
  if (outFile) writeFileSync(outFile, notes, 'utf8');
  else process.stdout.write(notes);
}

main();
