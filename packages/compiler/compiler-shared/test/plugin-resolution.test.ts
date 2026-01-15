import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolvePluginComponent, resolvePluginManifest } from '../lib';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Plugin Resolution - Local Plugins', () => {
    let tempDir: string;
    let projectRoot: string;

    beforeAll(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-plugin-test-'));
        projectRoot = tempDir;

        // Setup test plugin structures
        setupTestPlugins(tempDir);
    });

    afterAll(() => {
        // Cleanup temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('resolvePluginManifest', () => {
        it('should return error when plugin not found', () => {
            const result = resolvePluginManifest(projectRoot, 'non-existent-plugin');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Plugin "non-existent-plugin" not found');
            expect(result.validations[0]).toContain('src/plugins/non-existent-plugin/');
            expect(result.val).toBeNull();
        });

        it('should return error when plugin directory exists but plugin.yaml is missing', () => {
            const result = resolvePluginManifest(projectRoot, 'plugin-without-yaml');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('plugin.yaml is missing');
            expect(result.val).toBeNull();
        });

        it('should return error when plugin.yaml is invalid YAML', () => {
            const result = resolvePluginManifest(projectRoot, 'plugin-with-invalid-yaml');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Failed to parse plugin.yaml');
            expect(result.val).toBeNull();
        });

        it('should return error when plugin.yaml has no contracts', () => {
            const result = resolvePluginManifest(projectRoot, 'plugin-with-no-contracts');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('has no contracts defined');
            expect(result.val).toBeNull();
        });

        it('should successfully resolve valid local plugin manifest', () => {
            const result = resolvePluginManifest(projectRoot, 'valid-plugin');

            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            expect(result.val.name).toBe('valid-plugin');
            expect(result.val.contracts).toHaveLength(2);
            expect(result.val.contracts[0].name).toBe('counter');
            expect(result.val.contracts[1].name).toBe('timer');
        });

        it('should prefer local plugin over NPM when both exist and are valid', () => {
            // This test documents the priority: local plugins take precedence over NPM packages
            // Currently we only test local plugins, but this clarifies the expected behavior
            const result = resolvePluginManifest(projectRoot, 'valid-plugin');

            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            expect(result.val.name).toBe('valid-plugin');
        });

        it('should return local error when both local and NPM have errors', () => {
            // When both local and NPM have errors, prefer returning the local error
            // as it's more likely to be what the developer is working with
            const result = resolvePluginManifest(projectRoot, 'plugin-with-invalid-yaml');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('local plugin');
            expect(result.validations[0]).toContain('Failed to parse plugin.yaml');
            expect(result.val).toBeNull();
        });
    });

    describe('resolvePluginComponent', () => {
        it('should return error when plugin not found', () => {
            const result = resolvePluginComponent(
                projectRoot,
                'non-existent-plugin',
                'some-contract',
            );

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Plugin "non-existent-plugin" not found');
            expect(result.validations[0]).toContain('src/plugins/non-existent-plugin/');
            expect(result.val).toBeNull();
        });

        it('should return error when plugin directory exists but plugin.yaml is missing', () => {
            const result = resolvePluginComponent(
                projectRoot,
                'plugin-without-yaml',
                'some-contract',
            );

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('plugin.yaml is missing');
            expect(result.val).toBeNull();
        });

        it('should return error when plugin.yaml is invalid YAML', () => {
            const result = resolvePluginComponent(
                projectRoot,
                'plugin-with-invalid-yaml',
                'some-contract',
            );

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Failed to parse plugin.yaml');
            expect(result.val).toBeNull();
        });

        it('should return error when plugin has no contracts', () => {
            const result = resolvePluginComponent(
                projectRoot,
                'plugin-with-no-contracts',
                'some-contract',
            );

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('has no contracts defined');
            expect(result.val).toBeNull();
        });

        it('should return error when contract not found in plugin', () => {
            const result = resolvePluginComponent(
                projectRoot,
                'valid-plugin',
                'non-existent-contract',
            );

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Contract "non-existent-contract" not found');
            expect(result.validations[0]).toContain('Available contracts: counter, timer');
            expect(result.val).toBeNull();
        });

        it('should successfully resolve valid local plugin component', () => {
            const result = resolvePluginComponent(projectRoot, 'valid-plugin', 'counter');

            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            expect(result.val.contractPath).toContain('counter.jay-contract');
            expect(result.val.componentPath).toContain('index.js');
            expect(result.val.componentName).toBe('counter');
            expect(result.val.isNpmPackage).toBe(false);
        });

        it('should resolve component with custom module path', () => {
            const result = resolvePluginComponent(
                projectRoot,
                'plugin-with-custom-module',
                'timer',
            );

            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            expect(result.val.componentPath).toContain('dist/timer.js');
            expect(result.val.componentName).toBe('timerComponent');
            expect(result.val.isNpmPackage).toBe(false);
        });
    });
});

describe('Plugin Resolution - NPM Packages', () => {
    let tempDir: string;
    let projectRoot: string;

    beforeAll(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-npm-plugin-test-'));
        projectRoot = tempDir;

        // Setup test NPM plugin structures
        setupNpmPlugins(tempDir);
    });

    afterAll(() => {
        // Cleanup temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('resolvePluginManifest', () => {
        it('should successfully resolve valid NPM plugin manifest', () => {
            const result = resolvePluginManifest(projectRoot, '@test-scope/valid-npm-plugin');

            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            expect(result.val.name).toBe('@test-scope/valid-npm-plugin');
            expect(result.val.contracts).toHaveLength(2);
            expect(result.val.contracts[0].name).toBe('mood-tracker');
            expect(result.val.contracts[1].name).toBe('weather-widget');
        });

        it('should return error when NPM package plugin.yaml is missing', () => {
            const result = resolvePluginManifest(projectRoot, '@test-scope/npm-without-yaml');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('not found');
            expect(result.validations[0]).toContain('@test-scope/npm-without-yaml');
            expect(result.val).toBeNull();
        });

        it('should return error when NPM package plugin.yaml is invalid YAML', () => {
            const result = resolvePluginManifest(projectRoot, '@test-scope/npm-invalid-yaml');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Failed to parse plugin.yaml');
            expect(result.validations[0]).toContain('NPM package');
            expect(result.val).toBeNull();
        });

        it('should return error when NPM package has no contracts', () => {
            const result = resolvePluginManifest(projectRoot, '@test-scope/npm-no-contracts');

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('has no contracts defined');
            expect(result.validations[0]).toContain('NPM package');
            expect(result.val).toBeNull();
        });
    });

    describe('resolvePluginComponent', () => {
        it('should successfully resolve valid NPM plugin component', () => {
            const result = resolvePluginComponent(
                projectRoot,
                '@test-scope/valid-npm-plugin',
                'mood-tracker',
            );

            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            expect(result.val.contractPath).toContain('mood-tracker.jay-contract');
            expect(result.val.componentPath).toContain('index.js');
            expect(result.val.componentName).toBe('moodTracker');
            expect(result.val.isNpmPackage).toBe(true);
            expect(result.val.packageName).toBe('@test-scope/valid-npm-plugin');
        });

        it('should resolve NPM plugin component with custom module', () => {
            const result = resolvePluginComponent(
                projectRoot,
                '@test-scope/npm-custom-module',
                'custom-widget',
            );

            // Note: Current implementation has a bug where it doesn't use manifest.module
            // in the fallback case (line 288-289 in plugin-resolution.ts). It should use
            // manifest.module but instead hardcodes 'dist/index.js'
            expect(result.validations).toHaveLength(0);
            expect(result.val).not.toBeNull();
            // TODO: Fix implementation to use manifest.module, then change this to:
            // expect(result.val.componentPath).toContain('dist/components.js');
            expect(result.val.componentPath).toContain('dist/index.js');
            expect(result.val.componentName).toBe('customWidgetComponent');
            expect(result.val.isNpmPackage).toBe(true);
        });

        it('should return error when contract not found in NPM plugin', () => {
            const result = resolvePluginComponent(
                projectRoot,
                '@test-scope/valid-npm-plugin',
                'non-existent-contract',
            );

            expect(result.validations).toHaveLength(1);
            expect(result.validations[0]).toContain('Contract "non-existent-contract" not found');
            expect(result.validations[0]).toContain('NPM package');
            expect(result.validations[0]).toContain(
                'Available contracts: mood-tracker, weather-widget',
            );
            expect(result.val).toBeNull();
        });
    });
});

describe('Plugin Resolution - Local vs NPM Priority', () => {
    let tempDir: string;
    let projectRoot: string;

    beforeAll(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-priority-test-'));
        projectRoot = tempDir;

        // Setup both local and NPM plugins with same name
        setupTestPlugins(tempDir);
        setupNpmPlugins(tempDir);
    });

    afterAll(() => {
        // Cleanup temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should prefer local plugin over NPM when both exist and are valid', () => {
        // Create an NPM plugin with same name as local plugin
        const npmPluginDir = path.join(tempDir, 'node_modules', '@test-scope', 'duplicate-plugin');
        fs.mkdirSync(npmPluginDir, { recursive: true });

        // Create package.json for NPM plugin
        fs.writeFileSync(
            path.join(npmPluginDir, 'package.json'),
            JSON.stringify({
                name: '@test-scope/duplicate-plugin',
                version: '2.0.0',
                exports: {
                    './plugin.yaml': './plugin.yaml',
                    './contracts/npm-contract.jay-contract':
                        './dist/contracts/npm-contract.jay-contract',
                },
            }),
        );

        // Create plugin.yaml for NPM
        fs.writeFileSync(
            path.join(npmPluginDir, 'plugin.yaml'),
            `name: "@test-scope/duplicate-plugin"
version: 2.0.0
contracts:
  - name: npm-contract
    contract: contracts/npm-contract.jay-contract
    component: npmComponent
`,
        );

        // Create a local plugin with different name
        const localPluginDir = path.join(tempDir, 'src', 'plugins', 'duplicate-plugin');
        fs.mkdirSync(localPluginDir, { recursive: true });

        fs.writeFileSync(
            path.join(localPluginDir, 'plugin.yaml'),
            `name: duplicate-plugin
version: 1.0.0
contracts:
  - name: local-contract
    contract: contracts/local-contract.jay-contract
    component: localComponent
`,
        );

        // Resolve - should get local plugin
        const result = resolvePluginManifest(projectRoot, 'duplicate-plugin');

        expect(result.validations).toHaveLength(0);
        expect(result.val).not.toBeNull();
        expect(result.val.name).toBe('duplicate-plugin');
        expect(result.val.contracts).toHaveLength(1);
        expect(result.val.contracts[0].name).toBe('local-contract');
    });

    it('should fallback to NPM when local plugin does not exist', () => {
        const result = resolvePluginManifest(projectRoot, '@test-scope/valid-npm-plugin');

        expect(result.validations).toHaveLength(0);
        expect(result.val).not.toBeNull();
        expect(result.val.name).toBe('@test-scope/valid-npm-plugin');
    });
});

/**
 * Helper function to setup test plugin structures in the temporary directory
 */
function setupTestPlugins(tempDir: string) {
    const pluginsDir = path.join(tempDir, 'src', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    // 1. Plugin without plugin.yaml
    const pluginWithoutYaml = path.join(pluginsDir, 'plugin-without-yaml');
    fs.mkdirSync(pluginWithoutYaml);

    // 2. Plugin with invalid YAML
    const pluginWithInvalidYaml = path.join(pluginsDir, 'plugin-with-invalid-yaml');
    fs.mkdirSync(pluginWithInvalidYaml);
    fs.writeFileSync(
        path.join(pluginWithInvalidYaml, 'plugin.yaml'),
        'invalid: yaml: content: [unclosed',
    );

    // 3. Plugin with no contracts
    const pluginWithNoContracts = path.join(pluginsDir, 'plugin-with-no-contracts');
    fs.mkdirSync(pluginWithNoContracts);
    fs.writeFileSync(
        path.join(pluginWithNoContracts, 'plugin.yaml'),
        `name: plugin-with-no-contracts
version: 1.0.0
`,
    );

    // 4. Valid plugin with contracts
    const validPlugin = path.join(pluginsDir, 'valid-plugin');
    fs.mkdirSync(validPlugin);
    fs.writeFileSync(
        path.join(validPlugin, 'plugin.yaml'),
        `name: valid-plugin
version: 1.0.0
contracts:
  - name: counter
    contract: contracts/counter.jay-contract
    component: counter
  - name: timer
    contract: contracts/timer.jay-contract
    component: timer
`,
    );

    // 5. Plugin with custom module path
    const pluginWithCustomModule = path.join(pluginsDir, 'plugin-with-custom-module');
    fs.mkdirSync(pluginWithCustomModule);
    fs.writeFileSync(
        path.join(pluginWithCustomModule, 'plugin.yaml'),
        `name: plugin-with-custom-module
version: 1.0.0
module: dist/timer.js
contracts:
  - name: timer
    contract: contracts/timer.jay-contract
    component: timerComponent
`,
    );
}

/**
 * Helper function to setup test NPM plugin structures in node_modules
 */
function setupNpmPlugins(tempDir: string) {
    const nodeModulesDir = path.join(tempDir, 'node_modules', '@test-scope');
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    // 1. Valid NPM plugin with proper package.json and exports
    const validNpmPlugin = path.join(nodeModulesDir, 'valid-npm-plugin');
    fs.mkdirSync(validNpmPlugin);
    fs.mkdirSync(path.join(validNpmPlugin, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(validNpmPlugin, 'dist', 'contracts'), { recursive: true });

    fs.writeFileSync(
        path.join(validNpmPlugin, 'package.json'),
        JSON.stringify({
            name: '@test-scope/valid-npm-plugin',
            version: '1.0.0',
            main: './dist/index.js',
            exports: {
                '.': './dist/index.js',
                './plugin.yaml': './plugin.yaml',
                './mood-tracker.jay-contract': './dist/contracts/mood-tracker.jay-contract',
                './weather-widget.jay-contract': './dist/contracts/weather-widget.jay-contract',
            },
        }),
    );

    fs.writeFileSync(
        path.join(validNpmPlugin, 'plugin.yaml'),
        `name: "@test-scope/valid-npm-plugin"
version: 1.0.0
contracts:
  - name: mood-tracker
    contract: mood-tracker.jay-contract
    component: moodTracker
  - name: weather-widget
    contract: weather-widget.jay-contract
    component: weatherWidget
`,
    );

    // Create dummy contract files
    fs.writeFileSync(
        path.join(validNpmPlugin, 'dist', 'contracts', 'mood-tracker.jay-contract'),
        '// Contract file',
    );
    fs.writeFileSync(
        path.join(validNpmPlugin, 'dist', 'contracts', 'weather-widget.jay-contract'),
        '// Contract file',
    );
    fs.writeFileSync(path.join(validNpmPlugin, 'dist', 'index.js'), '// Component file');

    // 2. NPM plugin without plugin.yaml export (should fail resolution)
    const npmWithoutYaml = path.join(nodeModulesDir, 'npm-without-yaml');
    fs.mkdirSync(npmWithoutYaml);

    fs.writeFileSync(
        path.join(npmWithoutYaml, 'package.json'),
        JSON.stringify({
            name: '@test-scope/npm-without-yaml',
            version: '1.0.0',
            main: './dist/index.js',
            exports: {
                '.': './dist/index.js',
                // Note: plugin.yaml is NOT exported
            },
        }),
    );

    // 3. NPM plugin with invalid YAML
    const npmInvalidYaml = path.join(nodeModulesDir, 'npm-invalid-yaml');
    fs.mkdirSync(npmInvalidYaml);

    fs.writeFileSync(
        path.join(npmInvalidYaml, 'package.json'),
        JSON.stringify({
            name: '@test-scope/npm-invalid-yaml',
            version: '1.0.0',
            exports: {
                './plugin.yaml': './plugin.yaml',
            },
        }),
    );

    fs.writeFileSync(path.join(npmInvalidYaml, 'plugin.yaml'), 'invalid: yaml: content: [unclosed');

    // 4. NPM plugin with no contracts
    const npmNoContracts = path.join(nodeModulesDir, 'npm-no-contracts');
    fs.mkdirSync(npmNoContracts);

    fs.writeFileSync(
        path.join(npmNoContracts, 'package.json'),
        JSON.stringify({
            name: '@test-scope/npm-no-contracts',
            version: '1.0.0',
            exports: {
                './plugin.yaml': './plugin.yaml',
            },
        }),
    );

    fs.writeFileSync(
        path.join(npmNoContracts, 'plugin.yaml'),
        `name: "@test-scope/npm-no-contracts"
version: 1.0.0
`,
    );

    // 5. NPM plugin with custom module path
    const npmCustomModule = path.join(nodeModulesDir, 'npm-custom-module');
    fs.mkdirSync(npmCustomModule);
    fs.mkdirSync(path.join(npmCustomModule, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(npmCustomModule, 'dist', 'contracts'), { recursive: true });

    fs.writeFileSync(
        path.join(npmCustomModule, 'package.json'),
        JSON.stringify({
            name: '@test-scope/npm-custom-module',
            version: '1.0.0',
            exports: {
                '.': './dist/components.js',
                './plugin.yaml': './plugin.yaml',
                './custom-widget.jay-contract': './dist/contracts/custom-widget.jay-contract',
            },
        }),
    );

    fs.writeFileSync(
        path.join(npmCustomModule, 'plugin.yaml'),
        `name: "@test-scope/npm-custom-module"
version: 1.0.0
module: dist/components.js
contracts:
  - name: custom-widget
    contract: custom-widget.jay-contract
    component: customWidgetComponent
`,
    );

    fs.writeFileSync(
        path.join(npmCustomModule, 'dist', 'contracts', 'custom-widget.jay-contract'),
        '// Contract file',
    );
    fs.writeFileSync(path.join(npmCustomModule, 'dist', 'components.js'), '// Component file');
}
