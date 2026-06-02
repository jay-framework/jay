// @vitest-environment node

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as loadYaml } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginSetupContext } from '@jay-framework/stack-server-runtime';
import { setupUiKit } from '../lib/setup';

// Canonical shape reference (no @jay-framework/aiditor import):
// jay-aiditor/packages/aiditor/test/fixtures/add-menu/valid-item.yaml

const REJECTED_ITEM_FIELDS = [
  'kind',
  'parameters',
  'component',
  'allowedScopes',
] as const;
const REQUIRED_ITEM_FIELDS = ['id', 'title', 'category', 'prompt'] as const;

const EXPECTED_IDS = [
  'ui-kit:popover-menu',
  'ui-kit:scroll-carousel',
  'ui-kit:clipboard-copy',
  'ui-kit:word-split',
  'ui-kit:letter-split',
] as const;

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/ui-kit.yaml';

function makeCtx(
  projectRoot: string,
  overrides: Partial<PluginSetupContext> = {},
): PluginSetupContext {
  return {
    pluginName: 'ui-kit',
    projectRoot,
    configDir: join(projectRoot, 'config'),
    services: new Map(),
    force: false,
    ...overrides,
  };
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function loadExpectedCatalog() {
  const fixturePath = join(
    TEST_DIR,
    'fixtures/add-menu/expected-ui-kit.yaml',
  );
  return loadYaml(readFileSync(fixturePath, 'utf-8'));
}

function assertAddMenuCatalogShape(catalog: unknown): void {
  expect(catalog).toEqual(expect.objectContaining({ items: expect.any(Array) }));

  const items = (catalog as { items: Record<string, unknown>[] }).items;
  expect(items).toHaveLength(5);
  expect(items.map((item) => item.id)).toEqual([...EXPECTED_IDS]);

  for (const item of items) {
    for (const field of REQUIRED_ITEM_FIELDS) {
      expect(typeof item[field]).toBe('string');
      expect((item[field] as string).trim().length).toBeGreaterThan(0);
    }
    for (const field of REJECTED_ITEM_FIELDS) {
      expect(item).not.toHaveProperty(field);
    }
  }
}

describe('setupUiKit add-menu catalog (Design Log #142 U3)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'ui-kit-setup-'));
    mkdirSync(join(projectRoot, 'config'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writes ui-kit.yaml with five catalog items matching expected fixture', async () => {
    const result = await setupUiKit(makeCtx(projectRoot));

    expect(result.status).toBe('configured');
    expect(result.configCreated).toEqual([ADD_MENU_OUTPUT_REL]);

    const outputPath = join(projectRoot, ADD_MENU_OUTPUT_REL);
    expect(existsSync(outputPath)).toBe(true);

    const written = loadYaml(readFileSync(outputPath, 'utf-8'));
    assertAddMenuCatalogShape(written);
    expect(written).toEqual(loadExpectedCatalog());
  });

  it('each item prompt references agent-kit designer guide', async () => {
    await setupUiKit(makeCtx(projectRoot));

    const outputPath = join(projectRoot, ADD_MENU_OUTPUT_REL);
    const written = loadYaml(readFileSync(outputPath, 'utf-8')) as {
      items: { id: string; prompt: string }[];
    };

    for (const item of written.items) {
      const contract = item.id.split(':')[1];
      expect(item.prompt).toEqual(
        expect.stringMatching(
          new RegExp(`agent-kit/designer/${contract}\\.md`),
        ),
      );
    }
  });

  it('skips rewrite when output exists and force is false', async () => {
    const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
    mkdirSync(addMenuDir, { recursive: true });
    writeFileSync(join(addMenuDir, 'ui-kit.yaml'), 'items: []\n');

    const result = await setupUiKit(makeCtx(projectRoot));

    expect(result.status).toBe('configured');
    expect(result.configCreated).toBeUndefined();

    const written = loadYaml(
      readFileSync(join(addMenuDir, 'ui-kit.yaml'), 'utf-8'),
    );
    expect(written).toEqual({ items: [] });
  });

  it('rewrites output when force is true', async () => {
    const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
    mkdirSync(addMenuDir, { recursive: true });
    writeFileSync(join(addMenuDir, 'ui-kit.yaml'), 'items: []\n');

    const result = await setupUiKit(makeCtx(projectRoot, { force: true }));

    expect(result.status).toBe('configured');
    expect(result.configCreated).toEqual([ADD_MENU_OUTPUT_REL]);

    const written = loadYaml(
      readFileSync(join(addMenuDir, 'ui-kit.yaml'), 'utf-8'),
    );
    assertAddMenuCatalogShape(written);
    expect(written).toEqual(loadExpectedCatalog());
  });
});
