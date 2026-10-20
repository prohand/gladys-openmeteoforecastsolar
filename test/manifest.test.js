// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code registers — these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/app.js';
import { SCENE_ACTION_KEYS } from '../src/capabilities/scenes.js';
import { TRIGGERS } from '../src/capabilities/triggers.js';
import { SOLAR_WIDGET } from '../src/capabilities/widget.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { createHarness } from './helpers/harness.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them. The store validator refuses a manifest whose
// `gladys_version` minimum is lower: these tests catch it before a release.
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

/** Every multi-language text of the manifest, with where it sits. */
function* texts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      yield* texts(item, `${path}[${index}]`);
    }
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (['label', 'description', 'placeholder'].includes(key) && typeof value === 'object') {
      yield { path: `${path}.${key}`, value };
    } else {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('every text of the manifest exists in English, French, German and Spanish', () => {
  let count = 0;
  for (const { path, value } of texts(manifest)) {
    count += 1;
    assert.deepEqual(Object.keys(value), LANGUAGES, `${path} must be { en, fr, de, es }`);
    for (const language of LANGUAGES) {
      assert.ok(value[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
  assert.ok(count > 50, `only ${count} texts found`);
});

test('the integration is cloud only: Open-Meteo is reached over the internet', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('the location of the Gladys houses is requested, and only that', () => {
  assert.equal(manifest.location, true);
  assert.equal(manifest.network_discovery, undefined);
  assert.equal(manifest.containers, undefined);
});

test('every manifest action has a handler', async () => {
  assert.deepEqual(keysOf(manifest.actions), Object.values(ACTIONS));
  const harness = createHarness();
  for (const key of keysOf(manifest.actions)) {
    const ack = await harness.gladys.fake.action(key, {});
    assert.notEqual(ack.error, 'not implemented', `action "${key}" has no handler`);
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('declaring scene triggers, scene actions or widgets requires Gladys >= 5.1.0', () => {
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `the capability fields require gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('scene_actions and their handlers match', async () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.values(SCENE_ACTION_KEYS).sort());
  const harness = createHarness();
  for (const key of keysOf(manifest.scene_actions)) {
    const ack = await harness.gladys.fake.sceneAction(key, {});
    assert.notEqual(ack.error, 'not implemented', `scene action "${key}" has no handler`);
  }
});

test('scene_triggers are the triggers the code fires', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('the widget has a content handler', async () => {
  assert.deepEqual(keysOf(manifest.widgets), [SOLAR_WIDGET]);
  const harness = createHarness();
  const ack = await harness.gladys.fake.widgetGet(SOLAR_WIDGET);
  assert.equal(ack.success, true);
});

test('widget labels hold 3 to 30 characters, descriptions 100 at most', () => {
  for (const widget of manifest.widgets) {
    for (const [language, text] of Object.entries(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `${widget.key} label.${language}`);
    }
    for (const [language, text] of Object.entries(widget.description)) {
      assert.ok(text.length <= 100, `${widget.key} description.${language}: ${text.length}`);
    }
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `${field.key} has no default in DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('placeholders only sit on text and number fields', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.ok(['string', 'number', 'secret'].includes(field.type), `field "${field.key}"`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(
    manifest.docker_image,
    `ghcr.io/prohand/gladys-openmeteoforecastsolar:${manifest.version}`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});
