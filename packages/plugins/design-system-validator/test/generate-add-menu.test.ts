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
name: Test
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
components:
  button-primary:
    backgroundColor: "{colors.primary}"
  jay:product-card:
    backgroundColor: "{colors.background}"
---
# Test
`;

describe('generateDesignSystemAgentKit', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = makeTempProject(BASIC_DESIGN_MD);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('generates add-menu YAML from DESIGN.md tokens', async () => {
        const ctx = makeContext(tempDir);
        const result = await generateDesignSystemAgentKit(ctx);

        expect(result.agentKitCreated).toEqual(['agent-kit/aiditor/add-menu/design-system.yaml']);

        const outputPath = path.join(tempDir, 'agent-kit/aiditor/add-menu/design-system.yaml');
        expect(fs.existsSync(outputPath)).toEqual(true);

        const content = yaml.load(fs.readFileSync(outputPath, 'utf-8')) as any;
        expect(content.items).toBeDefined();
        expect(content.items.length).toBeGreaterThan(0);
    });

    it('generates color palette item', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);

        const outputPath = path.join(tempDir, 'agent-kit/aiditor/add-menu/design-system.yaml');
        const content = yaml.load(fs.readFileSync(outputPath, 'utf-8')) as any;
        const colorItem = content.items.find((i: any) => i.id === 'design-system:color-palette');

        expect(colorItem).toBeDefined();
        expect(colorItem.category).toEqual('Design System');
        expect(colorItem.subCategory).toEqual('Colors');
        expect(colorItem.prompt).toMatch(/primary.*#2563eb/);
    });

    it('generates component items including jay: components', async () => {
        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);

        const outputPath = path.join(tempDir, 'agent-kit/aiditor/add-menu/design-system.yaml');
        const content = yaml.load(fs.readFileSync(outputPath, 'utf-8')) as any;

        const btnItem = content.items.find(
            (i: any) => i.id === 'design-system:component-button-primary',
        );
        expect(btnItem).toBeDefined();

        const jayItem = content.items.find(
            (i: any) => i.id === 'design-system:component-jay:product-card',
        );
        expect(jayItem).toBeDefined();
        expect(jayItem.title).toEqual('jay:product-card');
    });

    it('returns empty when no DESIGN.md exists', async () => {
        const emptyDir = makeTempProject();
        const ctx = makeContext(emptyDir);
        const result = await generateDesignSystemAgentKit(ctx);

        expect(result.agentKitCreated).toEqual([]);
        fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('finds DESIGN.md in src/pages/ subdirectories', async () => {
        const pagesDir = path.join(tempDir, 'src', 'pages', 'products');
        fs.mkdirSync(pagesDir, { recursive: true });
        fs.writeFileSync(
            path.join(pagesDir, 'DESIGN.md'),
            `---\ncolors:\n  accent: "#ff6600"\n---\n# Products\n`,
            'utf-8',
        );

        const ctx = makeContext(tempDir);
        await generateDesignSystemAgentKit(ctx);

        const outputPath = path.join(tempDir, 'agent-kit/aiditor/add-menu/design-system.yaml');
        const content = yaml.load(fs.readFileSync(outputPath, 'utf-8')) as any;
        const colorItem = content.items.find((i: any) => i.id === 'design-system:color-palette');
        expect(colorItem.prompt).toMatch(/primary.*#2563eb/);
    });
});
