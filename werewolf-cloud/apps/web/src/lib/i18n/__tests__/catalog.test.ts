// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LOCALES_DIR = fileURLToPath(new URL('../locales', import.meta.url));

type CatalogValue = string | CatalogValue[] | { [key: string]: CatalogValue };

function flatten(value: CatalogValue, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out.set(prefix, String(value));
  return out;
}

function loadCatalog(locale: 'pl' | 'en'): Map<string, string> {
  const raw = readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8');
  return flatten(JSON.parse(raw) as CatalogValue);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.svelte-kit') continue;
      sourceFiles(path, out);
    } else if (/\.(svelte|ts|js)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

// Matches $_(, $t(, i18n.t(, t(, translate( and formatMessage( calls.
const CALL = String.raw`(?:\$_|\$t|i18n\.t|\bformatMessage|\btranslate|\bt)\s*\(\s*`;
const LITERAL_KEY = new RegExp(CALL + String.raw`(['"])((?:\\.|(?!\1)[^\\])*)\1`, 'g');
const TEMPLATE_KEY = new RegExp(CALL + '\x60([^\x60]*)\x60', 'g');
const KEY_SHAPE = /^[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/;

// Keys assembled as prefix + runtime value; the prefix itself is enough to audit.
const DYNAMIC_PREFIXES = [
  'attempt.status.', // attempt.status.<status>
  'contest_detail.lifts.', // contest_detail.lifts.<lift>
  'contest_detail.tabs.', // contest_detail.tabs.<lift>_table
  'contest_table.lifts.', // contest_table.lifts.<lift>
  'dashboard.contest.status.', // dashboard.contest.status.<status>
  'display_current.lifts.', // display_current.lifts.<lift>
];

function collectKeys() {
  const literal = new Map<string, string[]>();
  const dynamic = new Map<string, string[]>();
  for (const file of sourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(LITERAL_KEY)) {
      const key = match[2];
      if (!key || !KEY_SHAPE.test(key)) continue;
      literal.set(key, [...(literal.get(key) ?? []), file]);
    }
    for (const match of source.matchAll(TEMPLATE_KEY)) {
      const template = match[1] ?? '';
      const prefix = template.split('${')[0] ?? '';
      if (!template.includes('${')) {
        if (!KEY_SHAPE.test(template)) continue;
        literal.set(template, [...(literal.get(template) ?? []), file]);
        continue;
      }
      dynamic.set(prefix, [...(dynamic.get(prefix) ?? []), file]);
    }
  }
  return { literal, dynamic };
}

const pl = loadCatalog('pl');
const en = loadCatalog('en');

describe('i18n catalogs', () => {
  it('define the same key set in Polish and English', () => {
    const plKeys = [...pl.keys()].sort();
    const enKeys = [...en.keys()].sort();
    expect(enKeys).toEqual(plKeys);
  });

  it('resolve every key referenced literally in the app source', () => {
    const { literal } = collectKeys();
    const missing = [...literal.entries()]
      .filter(([key]) => !pl.has(key) || !en.has(key))
      .map(([key, files]) => `${key} (${[...new Set(files)].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('build dynamic keys only from the audited prefixes', () => {
    const { dynamic } = collectKeys();
    expect([...dynamic.keys()].sort()).toEqual([...DYNAMIC_PREFIXES].sort());
  });
});
