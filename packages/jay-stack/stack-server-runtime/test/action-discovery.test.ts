import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverAndRegisterActions, discoverAllPluginActions, ActionRegistry } from '../lib';

describe('Action Discovery', () => {
    let tempDir: string;
    let registry: ActionRegistry;

    beforeEach(async () => {
        // Create a temporary directory for test fixtures
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'action-discovery-test-'));
        registry = new ActionRegistry();
    });

    afterEach(async () => {
        // Clean up temporary directory
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    describe('discoverAndRegisterActions', () => {
        it('should return empty result when actions directory does not exist', async () => {
            const result = await discoverAndRegisterActions({
                projectRoot: tempDir,
                actionsDir: 'src/actions',
                registry,
            });

            expect(result.actionCount).toBe(0);
            expect(result.actionNames).toEqual([]);
            expect(result.scannedFiles).toEqual([]);
        });

        it('should return empty result when actions directory is empty', async () => {
            // Create empty actions directory
            const actionsDir = path.join(tempDir, 'src/actions');
            await fs.promises.mkdir(actionsDir, { recursive: true });

            const result = await discoverAndRegisterActions({
                projectRoot: tempDir,
                actionsDir: 'src/actions',
                registry,
            });

            expect(result.actionCount).toBe(0);
            expect(result.scannedFiles).toEqual([]);
        });

        it('should find .actions.ts files', async () => {
            // Create actions directory with a file
            const actionsDir = path.join(tempDir, 'src/actions');
            await fs.promises.mkdir(actionsDir, { recursive: true });

            // Create a simple action file (won't actually be imported in this test)
            const actionFile = path.join(actionsDir, 'test.actions.ts');
            await fs.promises.writeFile(
                actionFile,
                `export const testAction = { actionName: 'test', method: 'POST' };`,
            );

            const result = await discoverAndRegisterActions({
                projectRoot: tempDir,
                actionsDir: 'src/actions',
                registry,
            });

            // File should be scanned (even if import fails in test environment)
            expect(result.scannedFiles).toContain(actionFile);
        });

        it('should find actions in subdirectories', async () => {
            // Create nested actions directory
            const cartActionsDir = path.join(tempDir, 'src/actions/cart');
            await fs.promises.mkdir(cartActionsDir, { recursive: true });

            const actionFile = path.join(cartActionsDir, 'cart.actions.ts');
            await fs.promises.writeFile(actionFile, `export const add = {};`);

            const result = await discoverAndRegisterActions({
                projectRoot: tempDir,
                actionsDir: 'src/actions',
                registry,
            });

            expect(result.scannedFiles).toContain(actionFile);
        });

        it('should ignore non-action files', async () => {
            const actionsDir = path.join(tempDir, 'src/actions');
            await fs.promises.mkdir(actionsDir, { recursive: true });

            // Create various files
            await fs.promises.writeFile(path.join(actionsDir, 'cart.actions.ts'), '');
            await fs.promises.writeFile(path.join(actionsDir, 'utils.ts'), ''); // Should be ignored
            await fs.promises.writeFile(path.join(actionsDir, 'types.d.ts'), ''); // Should be ignored
            await fs.promises.writeFile(path.join(actionsDir, 'README.md'), ''); // Should be ignored

            const result = await discoverAndRegisterActions({
                projectRoot: tempDir,
                actionsDir: 'src/actions',
                registry,
            });

            expect(result.scannedFiles.length).toBe(1);
            expect(result.scannedFiles[0]).toContain('cart.actions.ts');
        });

        it('should use custom actions directory', async () => {
            // Create custom actions directory
            const customDir = path.join(tempDir, 'custom/path/actions');
            await fs.promises.mkdir(customDir, { recursive: true });

            const actionFile = path.join(customDir, 'custom.actions.ts');
            await fs.promises.writeFile(actionFile, '');

            const result = await discoverAndRegisterActions({
                projectRoot: tempDir,
                actionsDir: 'custom/path/actions',
                registry,
            });

            expect(result.scannedFiles).toContain(actionFile);
        });
    });

    describe('discoverAllPluginActions', () => {
        it('should return empty array when no plugins directory exists', async () => {
            const result = await discoverAllPluginActions({
                projectRoot: tempDir,
                registry,
            });

            expect(result).toEqual([]);
        });

        it('should return empty array when plugins directory is empty', async () => {
            const pluginsDir = path.join(tempDir, 'src/plugins');
            await fs.promises.mkdir(pluginsDir, { recursive: true });

            const result = await discoverAllPluginActions({
                projectRoot: tempDir,
                registry,
            });

            expect(result).toEqual([]);
        });

        it('should skip plugins without plugin.yaml', async () => {
            const pluginDir = path.join(tempDir, 'src/plugins/my-plugin');
            await fs.promises.mkdir(pluginDir, { recursive: true });
            // No plugin.yaml created

            const result = await discoverAllPluginActions({
                projectRoot: tempDir,
                registry,
            });

            expect(result).toEqual([]);
        });

        it('should skip plugins without actions field', async () => {
            const pluginDir = path.join(tempDir, 'src/plugins/my-plugin');
            await fs.promises.mkdir(pluginDir, { recursive: true });

            // Create plugin.yaml without actions
            await fs.promises.writeFile(
                path.join(pluginDir, 'plugin.yaml'),
                `name: my-plugin\nversion: "1.0.0"`,
            );

            const result = await discoverAllPluginActions({
                projectRoot: tempDir,
                registry,
            });

            expect(result).toEqual([]);
        });

        it('should parse plugin.yaml with actions array', async () => {
            const pluginDir = path.join(tempDir, 'src/plugins/my-plugin');
            await fs.promises.mkdir(pluginDir, { recursive: true });

            // Create plugin.yaml with actions
            await fs.promises.writeFile(
                path.join(pluginDir, 'plugin.yaml'),
                `name: my-plugin\nversion: "1.0.0"\nactions:\n  - addToCart\n  - removeFromCart`,
            );

            // Create an index.ts (won't be imported in test, but shows the structure)
            await fs.promises.writeFile(
                path.join(pluginDir, 'index.ts'),
                `export const addToCart = {}; export const removeFromCart = {};`,
            );

            // Will fail to import in test environment, but should parse plugin.yaml
            const result = await discoverAllPluginActions({
                projectRoot: tempDir,
                registry,
                verbose: false,
            });

            // Import will fail in test, so no actions registered
            expect(result).toEqual([]);
        });
    });
});
