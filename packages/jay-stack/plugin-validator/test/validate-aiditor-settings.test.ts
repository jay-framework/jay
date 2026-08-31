import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';

import {
    validateAiditorSettings,
    AIDITOR_SETTINGS_TEMPLATE_REL_PATH,
} from '../lib/validate-aiditor-settings';
import type { ValidationResult } from '../lib/types';

const VALID_TEMPLATE = `label: Test Settings
route: /test-plugin/settings
`;

describe('validateAiditorSettings (validate-plugin step)', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function makePluginWithSettingsTemplate(
        templateYaml: string,
        pluginYaml: string,
    ): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-aiditor-settings-plugin-'));
        tempDirs.push(dir);
        fs.writeFileSync(path.join(dir, 'plugin.yaml'), pluginYaml);
        const templateAbs = path.join(dir, AIDITOR_SETTINGS_TEMPLATE_REL_PATH);
        fs.mkdirSync(path.dirname(templateAbs), { recursive: true });
        fs.writeFileSync(templateAbs, templateYaml);
        return dir;
    }

    function emptyResult(): ValidationResult {
        return { valid: true, errors: [], warnings: [] };
    }

    it('skips when plugin has no settings template', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-aiditor-settings-plugin-'));
        tempDirs.push(dir);
        fs.writeFileSync(path.join(dir, 'plugin.yaml'), 'name: no-settings-fixture\nsetup: setup\n');

        const result = emptyResult();
        await validateAiditorSettings(
            { manifest: { name: 'no-settings-fixture' }, pluginPath: dir, isNpmPackage: false },
            result,
        );

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('errors when settings route is not declared in plugin.yaml routes[]', async () => {
        const pluginPath = makePluginWithSettingsTemplate(
            VALID_TEMPLATE,
            `name: settings-test-fixture
setup: setup
agentkit: generateAgentKit
routes:
  - path: /other/route
    jayHtml: ./lib/pages/settings/page.jay-html
    component: settingsPage
    devOnly: true
`,
        );
        const result = emptyResult();
        await validateAiditorSettings(
            {
                manifest: {
                    name: 'settings-test-fixture',
                    setup: 'setup',
                    agentkit: 'generateAgentKit',
                    routes: [
                        {
                            path: '/other/route',
                            jayHtml: './lib/pages/settings/page.jay-html',
                            component: 'settingsPage',
                            devOnly: true,
                        },
                    ],
                },
                pluginPath,
                isNpmPackage: false,
            },
            result,
        );

        expect(result.errors.map((error) => error.code)).toEqual(['settings-route-missing']);
        expect(result.errors[0]?.suggestion).toMatch(/routes\[\]/);
        expect(result.warnings).toEqual([]);
    });

    it('errors when settings route lacks devOnly: true', async () => {
        const pluginPath = makePluginWithSettingsTemplate(
            VALID_TEMPLATE,
            `name: settings-test-fixture
setup: setup
agentkit: generateAgentKit
routes:
  - path: /test-plugin/settings
    jayHtml: ./lib/pages/settings/page.jay-html
    component: settingsPage
`,
        );
        const result = emptyResult();
        await validateAiditorSettings(
            {
                manifest: {
                    name: 'settings-test-fixture',
                    setup: 'setup',
                    agentkit: 'generateAgentKit',
                    routes: [
                        {
                            path: '/test-plugin/settings',
                            jayHtml: './lib/pages/settings/page.jay-html',
                            component: 'settingsPage',
                        },
                    ],
                },
                pluginPath,
                isNpmPackage: false,
            },
            result,
        );

        expect(result.errors.map((error) => error.code)).toEqual(['settings-route-dev-only']);
        expect(result.errors[0]?.suggestion).toMatch(/devOnly: true/);
        expect(result.warnings).toEqual([]);
    });

    it('errors when template exists but plugin.yaml has no agentkit handler', async () => {
        const pluginPath = makePluginWithSettingsTemplate(
            VALID_TEMPLATE,
            `name: settings-test-fixture
setup: setup
routes:
  - path: /test-plugin/settings
    jayHtml: ./lib/pages/settings/page.jay-html
    component: settingsPage
    devOnly: true
`,
        );
        const result = emptyResult();
        await validateAiditorSettings(
            {
                manifest: {
                    name: 'settings-test-fixture',
                    setup: 'setup',
                    routes: [
                        {
                            path: '/test-plugin/settings',
                            jayHtml: './lib/pages/settings/page.jay-html',
                            component: 'settingsPage',
                            devOnly: true,
                        },
                    ],
                },
                pluginPath,
                isNpmPackage: false,
            },
            result,
        );

        expect(result.errors.map((error) => error.code)).toEqual([
            'settings-missing-agentkit-handler',
        ]);
        expect(result.errors[0]?.suggestion).toMatch(/agentkit/);
        expect(result.warnings).toEqual([]);
    });

    it('passes when template, route, devOnly, and agentkit are all correct', async () => {
        const pluginPath = makePluginWithSettingsTemplate(
            VALID_TEMPLATE,
            `name: settings-test-fixture
setup: setup
agentkit: generateAgentKit
routes:
  - path: /test-plugin/settings
    jayHtml: ./lib/pages/settings/page.jay-html
    component: settingsPage
    devOnly: true
`,
        );
        const result = emptyResult();
        await validateAiditorSettings(
            {
                manifest: {
                    name: 'settings-test-fixture',
                    setup: 'setup',
                    agentkit: 'generateAgentKit',
                    routes: [
                        {
                            path: '/test-plugin/settings',
                            jayHtml: './lib/pages/settings/page.jay-html',
                            component: 'settingsPage',
                            devOnly: true,
                        },
                    ],
                },
                pluginPath,
                isNpmPackage: false,
            },
            result,
        );

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });
});
