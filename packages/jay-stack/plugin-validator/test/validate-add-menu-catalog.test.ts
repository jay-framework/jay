import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { describe, it, expect, afterEach } from 'vitest';

import { lintAddMenuCatalog, validateAddMenuCatalogFile } from '../lib/add-menu-catalog-lint';
import {
    validateAddMenuCatalog,
    ADD_MENU_CATALOG_REL_PATHS,
} from '../lib/validate-add-menu-catalog';
import type { ValidationResult } from '../lib/types';

const SOURCE = 'add-menu.template.yaml';

function parseCatalog(yaml: string): unknown {
    return YAML.parse(yaml);
}

describe('add-menu catalog lint', () => {
    it('warns when gif item has no poster', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:gif-no-poster
    title: GIF without poster
    category: Test
    presentation:
      type: gif
      src: thumbnails/test/demo.gif
    prompt: ok
`),
            SOURCE,
        );
        expect(validated.errors).toEqual([]);
        const linted = lintAddMenuCatalog(validated.file!.items, SOURCE);
        expect(linted.errors).toEqual([]);
        expect(linted.warnings.map((w) => w.code)).toEqual(['gif-missing-poster']);
        expect(linted.warnings[0]?.itemId).toEqual('test-plugin:gif-no-poster');
    });

    it('errors when html-fragment uses presentation.src', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:bad-html
    title: Bad html fragment
    category: Test
    presentation:
      type: html-fragment
      src: previews/bad.html
      html: |
        <div class="am-preview"><p>ok</p></div>
    prompt: ok
`),
            SOURCE,
        );
        expect(validated.errors.some((e) => e.code === 'html-fragment-src-not-allowed')).toBe(true);
    });

    it('accepts html-fragment with scoped root div', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:html-inline
    title: HTML inline
    category: Test
    presentation:
      type: html-fragment
      html: |
        <div class="am-preview am-preview--test">
          <style>
            @scope (.am-preview) {
              :scope { display: flex; height: 100%; }
            }
          </style>
          <button type="button">Hover me</button>
        </div>
    prompt: ok
`),
            SOURCE,
        );
        expect(validated.errors).toEqual([]);
        const linted = lintAddMenuCatalog(validated.file!.items, SOURCE);
        expect(linted.errors).toEqual([]);
        expect(linted.warnings).toEqual([]);
    });

    it('errors on unknown browse.size', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:bad-size
    title: Bad size
    category: Test
    browse:
      size: xlarge
    prompt: ok
`),
            SOURCE,
        );
        expect(validated.file).toBeNull();
        expect(validated.errors.some((e) => e.code === 'browse-unknown-size')).toBe(true);
    });

    it('warns when large browse item has no presentation', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:large-no-preview
    title: Large hero
    category: Test
    browse:
      size: large
    prompt: ok
`),
            SOURCE,
        );
        expect(validated.errors).toEqual([]);
        const linted = lintAddMenuCatalog(validated.file!.items, SOURCE);
        expect(linted.warnings.map((w) => w.code)).toEqual(['browse-large-without-presentation']);
    });

    it('rejects invalid interaction.mode', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:bad-interaction
    title: Bad interaction
    category: Test
    prompt: ok
    interaction:
      mode: drag
`),
            SOURCE,
        );
        expect(validated.file).toBeNull();
        expect(validated.errors.some((e) => e.code === 'interaction-invalid-mode')).toBe(true);
    });

    it('accepts folderPath and interaction', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:folder-item
    title: Nested asset
    category: Media
    prompt: ok
    folderPath:
      - Marketing
      - Campaigns
    interaction:
      mode: reference
`),
            SOURCE,
        );
        expect(validated.errors).toEqual([]);
        expect(validated.file?.items[0]?.folderPath).toEqual(['Marketing', 'Campaigns']);
    });

    it('rejects folderPath with path separators', () => {
        const validated = validateAddMenuCatalogFile(
            parseCatalog(`
items:
  - id: test-plugin:bad-folder
    title: Bad folder
    category: Media
    prompt: ok
    folderPath:
      - Marketing/Campaigns
`),
            SOURCE,
        );
        expect(validated.file).toBeNull();
        expect(validated.errors.some((e) => e.code === 'folder-path-invalid-segment')).toBe(true);
    });
});

describe('validateAddMenuCatalog (validate-plugin step)', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function makePluginWithCatalog(catalogYaml: string): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-add-menu-plugin-'));
        tempDirs.push(dir);
        fs.writeFileSync(
            path.join(dir, 'plugin.yaml'),
            'name: add-menu-test-fixture\nsetup:\n  handler: setup\n',
        );
        const catalogRel = ADD_MENU_CATALOG_REL_PATHS[0];
        const catalogAbs = path.join(dir, catalogRel);
        fs.mkdirSync(path.dirname(catalogAbs), { recursive: true });
        fs.writeFileSync(catalogAbs, catalogYaml);
        return dir;
    }

    it('skips when plugin has no catalog yaml', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-add-menu-plugin-'));
        tempDirs.push(dir);
        fs.writeFileSync(
            path.join(dir, 'plugin.yaml'),
            'name: no-catalog-fixture\nsetup:\n  handler: setup\n',
        );

        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };
        await validateAddMenuCatalog(
            { manifest: { name: 'no-catalog-fixture' }, pluginPath: dir, isNpmPackage: false },
            result,
        );

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('maps lint findings into ValidationResult', async () => {
        const pluginPath = makePluginWithCatalog(`
items:
  - id: test-plugin:gif-no-poster
    title: GIF without poster
    category: Test
    presentation:
      type: gif
      src: thumbnails/test/demo.gif
    prompt: ok
`);
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };
        await validateAddMenuCatalog(
            {
                manifest: {
                    name: 'add-menu-test-fixture',
                    setup: 'setup',
                    agentkit: 'generateAgentKit',
                },
                pluginPath,
                isNpmPackage: false,
            },
            result,
        );

        expect(result.errors).toEqual([]);
        expect(result.warnings.map((w) => w.code)).toEqual(['gif-missing-poster']);
        expect(result.warnings[0]?.suggestion).toMatch(/poster/);
    });

    it('warns when plugin ships catalog but has no agentkit references handler', async () => {
        const pluginPath = makePluginWithCatalog(`
items:
  - id: test-plugin:ok
    title: OK
    category: Test
    prompt: ok
`);
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };
        await validateAddMenuCatalog(
            { manifest: { name: 'add-menu-test-fixture' }, pluginPath, isNpmPackage: false },
            result,
        );

        expect(result.warnings.map((w) => w.code)).toEqual(['add-menu-missing-agentkit-handler']);
        expect(result.warnings[0]?.suggestion).toMatch(/agentkit/);
    });

    it('does not warn about agentkit handler when agentkit is declared', async () => {
        const pluginPath = makePluginWithCatalog(`
items:
  - id: test-plugin:ok
    title: OK
    category: Test
    prompt: ok
`);
        fs.writeFileSync(
            path.join(pluginPath, 'plugin.yaml'),
            'name: add-menu-test-fixture\nsetup: setup\nagentkit: generateAgentKit\n',
        );
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };
        await validateAddMenuCatalog(
            {
                manifest: {
                    name: 'add-menu-test-fixture',
                    setup: 'setup',
                    agentkit: 'generateAgentKit',
                },
                pluginPath,
                isNpmPackage: false,
            },
            result,
        );

        expect(
            result.warnings.filter((w) => w.code === 'add-menu-missing-agentkit-handler'),
        ).toEqual([]);
    });
});
