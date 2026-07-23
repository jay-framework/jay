import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateDesignSystemAgentKit } from '../lib/generate-add-menu.js';
import type { PluginAgentKitContext } from '@jay-framework/stack-server-runtime';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

function makeTempProject(designMdContent?: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsv-test-'));
    if (designMdContent) {
        fs.writeFileSync(path.join(dir, 'DESIGN.md'), designMdContent, 'utf-8');
    }
    return dir;
}

function makeContext(projectRoot: string): PluginAgentKitContext {
    return {
        pluginName: 'design-system-validator',
        projectRoot,
        referencesDir: path.join(projectRoot, 'agent-kit', 'references', 'design-system-validator'),
        services: new Map(),
        force: false,
    };
}

const BASIC_DESIGN_MD = `---
name: Test Design
colors:
  primary: "#2563eb"
  background: "#ffffff"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
spacing:
  sm: 0.5rem
  md: 1rem
rounded:
  md: 0.5rem
breakpoints:
  mobile: 600px
animations:
  fade-in:
    duration: 300ms
    easing: ease
components:
  button-primary:
    backgroundColor: "{colors.primary}"
  jay:product-card:
    backgroundColor: "{colors.background}"
---
# Test
`;

function readOutput(dir: string): any {
    const outputPath = path.join(dir, 'agent-kit/aiditor/add-menu/design-system.yaml');
    return yaml.load(fs.readFileSync(outputPath, 'utf-8')) as any;
}

describe('generateDesignSystemAgentKit', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = makeTempProject(BASIC_DESIGN_MD);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('generates add-menu YAML with individual items per token', async () => {
        const ctx = makeContext(tempDir);
        const result = await generateDesignSystemAgentKit(ctx);

        expect(result.agentKitCreated).toEqual(['agent-kit/aiditor/add-menu/design-system.yaml']);
        const content = readOutput(tempDir);
        expect(content.items.length).toEqual(10);
    });

    it('generates one item per color token with HTML preview', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);
        const content = readOutput(tempDir);

        const primaryItem = content.items.find((i: any) => i.id === 'design-system:color-primary');
        expect(primaryItem).toBeDefined();
        expect(primaryItem.title).toEqual('primary (#2563eb)');
        expect(primaryItem.category).toEqual('Test Design');
        expect(primaryItem.subCategory).toEqual('Colors');
        expect(primaryItem.presentation.html).toMatch(/background:#2563eb/);
        expect(primaryItem.presentation.html).toMatch(/primary/);

        const bgItem = content.items.find((i: any) => i.id === 'design-system:color-background');
        expect(bgItem).toBeDefined();
    });

    it('generates typography items with HTML preview', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);
        const content = readOutput(tempDir);

        const bodyItem = content.items.find(
            (i: any) => i.id === 'design-system:typography-body-md',
        );
        expect(bodyItem).toBeDefined();
        expect(bodyItem.subCategory).toEqual('Typography');
        expect(bodyItem.prompt).toMatch(/Inter/);
        expect(bodyItem.presentation.html).toMatch(/font-family:Inter/);
        expect(bodyItem.presentation.html).toMatch(/The quick brown fox/);
    });

    it('generates items for spacing, rounded, breakpoints, and animations', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);
        const content = readOutput(tempDir);

        expect(content.items.find((i: any) => i.id === 'design-system:spacing-sm')).toBeDefined();
        expect(content.items.find((i: any) => i.id === 'design-system:rounded-md')).toBeDefined();
        expect(
            content.items.find((i: any) => i.id === 'design-system:breakpoint-mobile'),
        ).toBeDefined();
        expect(
            content.items.find((i: any) => i.id === 'design-system:animation-fade-in'),
        ).toBeDefined();
    });

    it('generates component items with resolved token values', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);
        const content = readOutput(tempDir);

        const btnItem = content.items.find(
            (i: any) => i.id === 'design-system:component-button-primary',
        );
        expect(btnItem).toBeDefined();
        expect(btnItem.prompt).toMatch(/{colors\.primary}/);
        expect(btnItem.prompt).toMatch(/#2563eb/);

        const jayItem = content.items.find(
            (i: any) => i.id === 'design-system:component-jay:product-card',
        );
        expect(jayItem).toBeDefined();
        expect(jayItem.title).toEqual('jay:product-card');
    });

    it('uses DESIGN.md name as category', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);
        const content = readOutput(tempDir);

        expect(content.items[0].category).toEqual('Test Design');
    });

    it('uses directory-based category for page-level DESIGN.md', async () => {
        const pagesDir = path.join(tempDir, 'src', 'pages', 'products');
        fs.mkdirSync(pagesDir, { recursive: true });
        fs.writeFileSync(
            path.join(pagesDir, 'DESIGN.md'),
            `---\ncolors:\n  accent: "#ff6600"\n---\n# Products\n`,
            'utf-8',
        );

        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);
        const content = readOutput(tempDir);

        const accentItem = content.items.find((i: any) => i.id === 'design-system:color-accent');
        expect(accentItem).toBeDefined();
        expect(accentItem.category).toEqual('Design System (products)');
    });

    it('returns empty when no DESIGN.md exists', async () => {
        const emptyDir = makeTempProject();
        const ctx = makeContext(emptyDir);
        const result = await generateDesignSystemAgentKit(ctx);

        expect(result.agentKitCreated).toEqual([]);
        fs.rmSync(emptyDir, { recursive: true, force: true });
    });
});
