// @vitest-environment node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginReferencesContext } from '@jay-framework/stack-server-runtime';
import { generateUiKitReferences } from '../lib/setup';

// Canonical shape reference (no @jay-framework/aiditor import):
// jay-aiditor/packages/aiditor/test/fixtures/add-menu/valid-item.yaml

const REJECTED_ITEM_FIELDS = ['kind', 'parameters', 'component', 'allowedScopes'] as const;
const REQUIRED_ITEM_FIELDS = ['id', 'title', 'category', 'prompt'] as const;

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/ui-kit.yaml';
const SPRING_SKILL_OUTPUT_REL = 'agent-kit/aiditor/skills/ui-kit/spring-button-hover.md';
const STICKY_SKILL_OUTPUT_REL = 'agent-kit/aiditor/skills/ui-kit/sticky-header-scroll.md';

function makeCtx(
    projectRoot: string,
    overrides: Partial<PluginReferencesContext> = {},
): PluginReferencesContext {
    return {
        pluginName: 'ui-kit',
        projectRoot,
        referencesDir: join(projectRoot, 'agent-kit/references/ui-kit'),
        services: new Map(),
        force: false,
        ...overrides,
    };
}

function assertAddMenuCatalogShape(catalog: unknown): void {
    expect(catalog).toEqual(expect.objectContaining({ items: expect.any(Array) }));

    const items = (catalog as { items: Record<string, unknown>[] }).items;
    expect(items.length).toBeGreaterThan(0);

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

describe('generateUiKitReferences add-menu catalog (Design Log #142 U3)', () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = mkdtempSync(join(tmpdir(), 'ui-kit-agentkit-'));
        mkdirSync(join(projectRoot, 'config'), { recursive: true });
    });

    afterEach(() => {
        rmSync(projectRoot, { recursive: true, force: true });
    });

    it('writes ui-kit.yaml with valid catalog items', async () => {
        const result = await generateUiKitReferences(makeCtx(projectRoot));

        expect(result.referencesCreated).toEqual(
            expect.arrayContaining([
                ADD_MENU_OUTPUT_REL,
                SPRING_SKILL_OUTPUT_REL,
                STICKY_SKILL_OUTPUT_REL,
            ]),
        );

        const outputPath = join(projectRoot, ADD_MENU_OUTPUT_REL);
        expect(existsSync(outputPath)).toBe(true);

        const written = loadYaml(readFileSync(outputPath, 'utf-8'));
        assertAddMenuCatalogShape(written);
    });

    it('writes effect skill markdown files for AIditor', async () => {
        await generateUiKitReferences(makeCtx(projectRoot));

        const springPath = join(projectRoot, SPRING_SKILL_OUTPUT_REL);
        expect(existsSync(springPath)).toBe(true);
        const springContent = readFileSync(springPath, 'utf-8');
        expect(springContent).toEqual(expect.stringMatching(/\.ui-kit-spring-hover/));
        expect(springContent).toEqual(expect.stringMatching(/linear\(/));

        const stickyPath = join(projectRoot, STICKY_SKILL_OUTPUT_REL);
        expect(existsSync(stickyPath)).toBe(true);
        const stickyContent = readFileSync(stickyPath, 'utf-8');
        expect(stickyContent).toEqual(expect.stringMatching(/\.ui-kit-sticky-header/));
        expect(stickyContent).toEqual(expect.stringMatching(/animation-timeline:\s*scroll\(\)/));
    });

    it('skips rewrite when output exists and force is false', async () => {
        const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
        mkdirSync(addMenuDir, { recursive: true });
        writeFileSync(join(addMenuDir, 'ui-kit.yaml'), 'items: []\n');

        const skillDir = join(projectRoot, 'agent-kit/aiditor/skills/ui-kit');
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(join(skillDir, 'spring-button-hover.md'), '# stale\n');
        writeFileSync(join(skillDir, 'sticky-header-scroll.md'), '# stale\n');

        const result = await generateUiKitReferences(makeCtx(projectRoot));

        expect(result.referencesCreated).not.toContain(ADD_MENU_OUTPUT_REL);

        const written = loadYaml(readFileSync(join(addMenuDir, 'ui-kit.yaml'), 'utf-8'));
        expect(written).toEqual({ items: [] });
        expect(readFileSync(join(skillDir, 'spring-button-hover.md'), 'utf-8')).toBe('# stale\n');
        expect(readFileSync(join(skillDir, 'sticky-header-scroll.md'), 'utf-8')).toBe('# stale\n');
    });

    it('rewrites output when force is true', async () => {
        const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
        mkdirSync(addMenuDir, { recursive: true });
        writeFileSync(join(addMenuDir, 'ui-kit.yaml'), 'items: []\n');

        const skillDir = join(projectRoot, 'agent-kit/aiditor/skills/ui-kit');
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(join(skillDir, 'spring-button-hover.md'), '# stale\n');
        writeFileSync(join(skillDir, 'sticky-header-scroll.md'), '# stale\n');

        const result = await generateUiKitReferences(makeCtx(projectRoot, { force: true }));

        expect(result.referencesCreated).toEqual(
            expect.arrayContaining([
                ADD_MENU_OUTPUT_REL,
                SPRING_SKILL_OUTPUT_REL,
                STICKY_SKILL_OUTPUT_REL,
            ]),
        );

        const written = loadYaml(readFileSync(join(addMenuDir, 'ui-kit.yaml'), 'utf-8'));
        assertAddMenuCatalogShape(written);

        expect(readFileSync(join(skillDir, 'spring-button-hover.md'), 'utf-8')).toEqual(
            expect.stringMatching(/\.ui-kit-spring-hover/),
        );
        expect(readFileSync(join(skillDir, 'sticky-header-scroll.md'), 'utf-8')).toEqual(
            expect.stringMatching(/\.ui-kit-sticky-header/),
        );
    });

    it('copies Add Menu thumbnails into public/ on agent-kit', async () => {
        const result = await generateUiKitReferences(makeCtx(projectRoot));

        expect(result.referencesCreated).toEqual(
            expect.arrayContaining(['public/aiditor-add-menu-thumbnails/ui-kit/popover-menu.svg']),
        );
        expect(
            existsSync(
                join(projectRoot, 'public/aiditor-add-menu-thumbnails/ui-kit/popover-menu.svg'),
            ),
        ).toBe(true);
    });
});
