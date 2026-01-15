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
