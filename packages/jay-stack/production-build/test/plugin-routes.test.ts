import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanProductionPluginRoutes } from '@jay-framework/production-build';
import type { JayRoute } from '@jay-framework/stack-route-scanner';

/**
 * DL#240 — a dev-only project page must not shadow a plugin's production route in the build.
 * Before the fix, the build passed every project route (dev-only included) to scanPluginRoutes,
 * which drops a plugin route whose path a project route already has, so a dev-only `/settings`
 * page silently removed a plugin's production `/settings`.
 */
describe('scanProductionPluginRoutes', () => {
    let projectRoot: string;

    function projectRoute(rawRoute: string, devOnly?: boolean): JayRoute {
        return {
            segments: rawRoute.split('/').filter(Boolean),
            rawRoute,
            jayHtmlPath: path.join(projectRoot, 'src/pages', rawRoute, 'page.jay-html'),
            compPath: '',
            ...(devOnly && { devOnly: true }),
        };
    }

    beforeAll(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jay-plugin-routes-'));
        const pluginDir = path.join(projectRoot, 'node_modules/settings-plugin');
        await fs.mkdir(pluginDir, { recursive: true });
        await fs.writeFile(
            path.join(projectRoot, 'package.json'),
            JSON.stringify({ name: 'app', dependencies: { 'settings-plugin': '1.0.0' } }),
        );
        await fs.writeFile(
            path.join(pluginDir, 'package.json'),
            JSON.stringify({ name: 'settings-plugin', version: '1.0.0', main: 'index.js' }),
        );
        await fs.writeFile(path.join(pluginDir, 'index.js'), 'export const settings = {};\n');
        await fs.writeFile(path.join(pluginDir, 'settings.jay-html'), '<html></html>\n');
        await fs.writeFile(
            path.join(pluginDir, 'plugin.yaml'),
            [
                'name: settings-plugin',
                'routes:',
                '  - path: /settings',
                '    jayHtml: settings.jay-html',
                '    component: settings',
                '',
            ].join('\n'),
        );
    });

    afterAll(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('keeps the plugin production route when only a dev-only project page has its path', async () => {
        const pluginRoutes = await scanProductionPluginRoutes(projectRoot, [
            projectRoute('/settings', true),
        ]);

        expect(pluginRoutes.map((r) => r.rawRoute)).toEqual(['/settings']);
    });

    it('still lets a production project page take precedence over the plugin route', async () => {
        const pluginRoutes = await scanProductionPluginRoutes(projectRoot, [
            projectRoute('/settings'),
        ]);

        expect(pluginRoutes).toEqual([]);
    });
});
