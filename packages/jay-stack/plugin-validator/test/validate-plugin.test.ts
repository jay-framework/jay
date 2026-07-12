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
