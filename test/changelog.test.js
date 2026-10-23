// The Release workflow rolls CHANGELOG.md with .github/scripts/changelog-release.mjs
// and pushes the result straight to main: it must stay valid and Prettier-clean.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const changelogPath = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));
const REPO = 'https://github.com/prohand/gladys-openmeteoforecastsolar';

test('the real changelog has an Unreleased section the release can roll', async () => {
  const text = await readFile(changelogPath, 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  const { version: current } = JSON.parse(
    await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  );
  const rolled = rollChangelog(text, '9.9.9', '2026-10-20');
  assert.match(rolled, /^## \[Unreleased\]\n\n## \[9\.9\.9\] - 2026-10-20$/m);
  assert.ok(
    rolled.includes(`[9.9.9]: ${REPO}/compare/v${current}...v9.9.9`),
    'the release compares with the last tag',
  );
  const options = { ...(await prettier.resolveConfig(changelogPath)), filepath: changelogPath };
  assert.equal(await prettier.format(rolled, options), rolled, 'the release commit stays clean');
});

test('the next release compares with the previous tag', () => {
  const text = `# Changelog

## [Unreleased]

### Fixed

- Thing.

## [1.0.0] - 2026-10-20

- First.

[Unreleased]: ${REPO}/compare/v1.0.0...HEAD
[1.0.0]: ${REPO}/releases/tag/v1.0.0
`;
  const rolled = rollChangelog(text, '1.0.1', '2026-10-21');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-21\n\n### Fixed\n\n- Thing\./,
  );
  assert.match(rolled, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD`));
  assert.match(
    rolled,
    new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`),
  );
});

test('an empty Unreleased section still names the version', () => {
  const rolled = rollChangelog('# Changelog\n\n## [Unreleased]\n', '1.0.1', '2026-10-21');
  assert.match(rolled, /## \[1\.0\.1\] - 2026-10-21\n\n- Maintenance release/);
});

test('the same version is never released twice', () => {
  const text = '# Changelog\n\n## [Unreleased]\n\n## [1.0.1] - 2026-10-21\n\n- Thing.\n';
  assert.equal(rollChangelog(text, '1.0.1', '2026-10-22'), text);
});
