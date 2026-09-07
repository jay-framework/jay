import { describe, it, expect } from 'vitest';
import { validatePlugin } from '../lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

function createTempPlugin(structure: {
    pluginYaml: string;
    packageJson: Record<string, unknown>;
    agentKit?: boolean;
}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-validator-test-'));
    fs.writeFileSync(path.join(dir, 'plugin.yaml'), structure.pluginYaml);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(structure.packageJson));
    if (structure.agentKit) {
        const agentKitDir = path.join(dir, 'agent-kit', 'designer');
        fs.mkdirSync(agentKitDir, { recursive: true });
        fs.writeFileSync(path.join(agentKitDir, 'guide.md'), '# Guide');
    }
    return dir;
}

function createTempPluginWithSource(structure: {
    pluginYaml: string;
    packageJson: Record<string, unknown>;
    sourceFiles?: Record<string, string>;
}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-validator-test-'));
    fs.writeFileSync(path.join(dir, 'plugin.yaml'), structure.pluginYaml);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(structure.packageJson));
    if (structure.sourceFiles) {
        for (const [filePath, content] of Object.entries(structure.sourceFiles)) {
            const fullPath = path.join(dir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
        }
    }
    return dir;
}

const minimalPluginYaml = `name: test-plugin\nvalidators:\n  - name: test\n    handler: testHandler\n`;

describe('validatePlugin — agent-kit shipping', () => {
    it('should warn when agent-kit directory exists but is not in package.json files', async () => {
        const dir = createTempPlugin({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './plugin.yaml': './plugin.yaml',
                },
                files: ['dist', 'plugin.yaml'],
            },
            agentKit: true,
        });

        const result = await validatePlugin({ pluginPath: dir });

        const agentKitWarning = result.warnings.find((w) =>
            w.message.includes('agent-kit directory exists but is not listed'),
        );
        expect(agentKitWarning).toBeDefined();
        expect(agentKitWarning!.suggestion).toEqual(
            'Add "agent-kit" to the "files" array so agent-kit files are shipped with the package',
        );
    });

    it('should not warn when agent-kit directory is listed in package.json files', async () => {
        const dir = createTempPlugin({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './plugin.yaml': './plugin.yaml',
                },
                files: ['dist', 'plugin.yaml', 'agent-kit'],
            },
            agentKit: true,
        });

        const result = await validatePlugin({ pluginPath: dir });

        const agentKitWarning = result.warnings.find((w) =>
            w.message.includes('agent-kit directory exists but is not listed'),
        );
        expect(agentKitWarning).toBeUndefined();
    });

    it('should not warn when no agent-kit directory exists', async () => {
        const dir = createTempPlugin({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './plugin.yaml': './plugin.yaml',
                },
                files: ['dist', 'plugin.yaml'],
            },
            agentKit: false,
        });

        const result = await validatePlugin({ pluginPath: dir });

        const agentKitWarning = result.warnings.find((w) =>
            w.message.includes('agent-kit directory exists but is not listed'),
        );
        expect(agentKitWarning).toBeUndefined();
    });
});

describe('validatePlugin — dynamic contract generator shape', () => {
    it('should error when generator is a bare function instead of DynamicContractGenerator', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'dynamic_contracts:',
                '  - prefix: data-pages',
                '    component: dataPages',
                '    generator: generateContract',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'lib/index.ts': `export { generateContract } from './gen.js';\nexport { dataPages } from './comp.js';\n`,
                'lib/gen.ts': `export async function* generateContract() { yield { name: 'x', yaml: '' }; }\n`,
                'dist/index.js': `export { generateContract } from './gen.js';\nexport { dataPages } from './comp.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const genError = result.errors.find((e) => e.message.includes('bare function'));
        expect(genError).toBeDefined();
        expect(genError!.suggestion).toEqual(
            'Use makeContractGenerator().generateWith(...) from @jay-framework/fullstack-component instead of exporting a plain function',
        );
    });

    it('should not error when generator is a const (DynamicContractGenerator object)', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'dynamic_contracts:',
                '  - prefix: data-pages',
                '    component: dataPages',
                '    generator: generateContract',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'lib/index.ts': `export { generateContract } from './gen.js';\nexport { dataPages } from './comp.js';\n`,
                'lib/gen.ts': `export const generateContract = makeContractGenerator().generateWith(async () => []);\n`,
                'dist/index.js': `export { generateContract } from './gen.js';\nexport { dataPages } from './comp.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const genError = result.errors.find((e) => e.message.includes('bare function'));
        expect(genError).toBeUndefined();
    });
});

// DL#179 Part 2 — capability-aware validation
describe('validatePlugin — tools entry (./tools) requirement', () => {
    it('errors when validators are declared but ./tools export is missing', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: { '.': './dist/index.js', './plugin.yaml': './plugin.yaml' },
            },
            sourceFiles: { 'dist/index.js': `export {};\n` },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const toolsError = result.errors.find((e) =>
            e.message.includes('missing "./tools" entry point'),
        );
        expect(toolsError).toBeDefined();
    });

    it('passes when validators are declared and exported from ./tools', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'dist/index.js': `export {};\n`,
                'dist/tools.js': `export { testHandler } from './h.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        expect(result.errors).toEqual([]);
    });

    it('does not emit the legacy "no contracts" warning for a validator-only plugin', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'dist/index.js': `export {};\n`,
                'dist/tools.js': `export { testHandler } from './h.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const noContracts = result.warnings.find((w) =>
            w.message.includes('no contracts or dynamic_contracts'),
        );
        expect(noContracts).toBeUndefined();
    });
});

describe('validatePlugin — client entry (./client) interactive gating', () => {
    const contractYaml = [
        'name: test-plugin',
        'contracts:',
        '  - name: widget',
        '    contract: widget.jay-contract',
        '    component: widget',
    ].join('\n');

    function baseExports() {
        return {
            '.': './dist/index.js',
            './plugin.yaml': './plugin.yaml',
            './widget.jay-contract': './dist/widget.jay-contract',
        };
    }

    it('does not require ./client for a server-only component (no interactive mark)', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: contractYaml,
            packageJson: { name: '@jay-framework/test-plugin', exports: baseExports() },
            sourceFiles: {
                'dist/index.js': `export { widget } from './comp.js';\n`,
                'dist/widget.jay-contract': `name: widget\ntags:\n  - tag: title\n    type: data\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const clientErr = result.errors.find((e) => e.message.includes('"./client"'));
        expect(clientErr).toBeUndefined();
    });

    it('requires ./client when a component has an interactive phase', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: contractYaml,
            packageJson: { name: '@jay-framework/test-plugin', exports: baseExports() },
            sourceFiles: {
                'dist/index.js': `const c = withInteractiveMark(() => {});\nexport { widget } from './comp.js';\n`,
                'dist/widget.jay-contract': `name: widget\ntags:\n  - tag: title\n    type: data\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const clientErr = result.errors.find((e) => e.message.includes('"./client"'));
        expect(clientErr).toBeDefined();
    });

    it('requires ./client when the plugin provides a route, even with no interactive mark (DL#182)', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'routes:',
                '  - path: /aiditor',
                '    jayHtml: ./pages/aiditor/page.jay-html',
                '    component: aiditorPage',
                '    devOnly: true',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                    './pages/aiditor/page.jay-html': './dist/pages/aiditor/page.jay-html',
                },
            },
            sourceFiles: {
                'dist/index.js': `export const aiditorPage = {};\n`,
                'dist/tools.js': `export const aiditorPage = {};\n`,
                'dist/pages/aiditor/page.jay-html': `<html></html>\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const clientErr = result.errors.find((e) => e.message.includes('"./client"'));
        expect(clientErr).toBeDefined();
        expect(clientErr!.message).toEqual(
            'package.json exports missing "./client" entry point, but the plugin ' +
                'provides a route (hydrated in the browser)',
        );
    });

    it('does not require ./client when a route-providing plugin declares one (DL#182)', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'routes:',
                '  - path: /aiditor',
                '    jayHtml: ./pages/aiditor/page.jay-html',
                '    component: aiditorPage',
                '    devOnly: true',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './client': './dist/index.client.js',
                    './plugin.yaml': './plugin.yaml',
                    './pages/aiditor/page.jay-html': './dist/pages/aiditor/page.jay-html',
                },
            },
            sourceFiles: {
                'dist/index.js': `export const aiditorPage = {};\n`,
                'dist/tools.js': `export const aiditorPage = {};\n`,
                'dist/index.client.js': `export const aiditorPage = {};\n`,
                'dist/pages/aiditor/page.jay-html': `<html></html>\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const clientErr = result.errors.find((e) => e.message.includes('"./client"'));
        expect(clientErr).toBeUndefined();
    });

    it('requires ./client when contexts are declared', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'contexts:',
                '  - name: theme',
                '    marker: THEME_CONTEXT',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: { '.': './dist/index.js', './plugin.yaml': './plugin.yaml' },
            },
            sourceFiles: { 'dist/index.js': `export const THEME_CONTEXT = {};\n` },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const clientErr = result.errors.find((e) => e.message.includes('"./client"'));
        expect(clientErr).toBeDefined();
    });
});

describe('validatePlugin — at-least-one-capability rule', () => {
    it('warns when a plugin declares no capabilities', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: `name: test-plugin\n`,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: { '.': './dist/index.js', './plugin.yaml': './plugin.yaml' },
            },
            sourceFiles: { 'dist/index.js': `export {};\n` },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const warn = result.warnings.find((w) =>
            w.message.includes('Plugin declares no capabilities'),
        );
        expect(warn).toBeDefined();
        expect(warn!.suggestion).toEqual(
            'Declare at least one capability. See agent-kit/plugin/plugin-structure.md',
        );
    });

    it('does not warn for a global plugin with an init export', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: `name: test-plugin\nglobal: true\n`,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: { '.': './dist/index.js', './plugin.yaml': './plugin.yaml' },
            },
            sourceFiles: { 'dist/index.js': `export { init } from './init.js';\n` },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const warn = result.warnings.find((w) =>
            w.message.includes('Plugin declares no capabilities'),
        );
        expect(warn).toBeUndefined();
    });

    it('errors for a global plugin with no init/setup export', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: `name: test-plugin\nglobal: true\n`,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: { '.': './dist/index.js', './plugin.yaml': './plugin.yaml' },
            },
            sourceFiles: { 'dist/index.js': `export const somethingElse = 1;\n` },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const err = result.errors.find((e) => e.message.includes('global: true'));
        expect(err).toBeDefined();
    });
});

// DL#180 — devOnly actions
describe('validatePlugin — devOnly actions', () => {
    it('errors when actions[].devOnly is not a boolean', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'actions:',
                '  - name: runThing',
                '    devOnly: yes-please',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'dist/index.js': `export {};\n`,
                'dist/tools.js': `export { runThing } from './r.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const err = result.errors.find((e) => e.message.includes('devOnly must be a boolean'));
        expect(err).toBeDefined();
    });

    it('requires ./tools when a devOnly action is declared', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'actions:',
                '  - name: runThing',
                '    devOnly: true',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: { '.': './dist/index.js', './plugin.yaml': './plugin.yaml' },
            },
            sourceFiles: { 'dist/index.js': `export {};\n` },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const toolsErr = result.errors.find((e) =>
            e.message.includes('missing "./tools" entry point'),
        );
        expect(toolsErr).toBeDefined();
    });

    it('loads a devOnly action handler from ./tools, a regular action from `.`', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: [
                'name: test-plugin',
                'actions:',
                '  - name: fontFallback',
                '  - name: runThing',
                '    devOnly: true',
            ].join('\n'),
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'dist/index.js': `export { fontFallback } from './f.js';\n`,
                'dist/tools.js': `export { runThing } from './r.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        expect(result.errors).toEqual([]);
    });
});

// DL#179 — compiler leak scan
describe('validatePlugin — compiler leak scan', () => {
    it('errors when the serve entry imports a compiler package', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'dist/index.js': `import { walkElements } from '@jay-framework/compiler-shared';\nexport { walkElements };\n`,
                'dist/tools.js': `export { testHandler } from './h.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const leak = result.errors.find((e) => e.type === 'compiler-leak');
        expect(leak).toBeDefined();
    });

    it('passes when the serve entry is compiler-free', async () => {
        const dir = createTempPluginWithSource({
            pluginYaml: minimalPluginYaml,
            packageJson: {
                name: '@jay-framework/test-plugin',
                exports: {
                    '.': './dist/index.js',
                    './tools': './dist/tools.js',
                    './plugin.yaml': './plugin.yaml',
                },
            },
            sourceFiles: {
                'dist/index.js': `export {};\n`,
                'dist/tools.js': `import { walkElements } from '@jay-framework/compiler-shared';\nexport { testHandler } from './h.js';\n`,
            },
        });

        const result = await validatePlugin({ pluginPath: dir });

        const leak = result.errors.find((e) => e.type === 'compiler-leak');
        expect(leak).toBeUndefined();
    });
});
