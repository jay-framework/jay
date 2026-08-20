import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import {
    AIDITOR_SETTINGS_OUTPUT_REL,
    resolvePackagedAgentKitPath,
    writeAiditorSettingsContribution,
} from '../lib/aiditor/write-settings-contribution.js';

describe('writeAiditorSettingsContribution', () => {
    let tempDir: string;
    let templatePath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsv-settings-test-'));
        templatePath = path.join(tempDir, 'settings.template.yaml');
        fs.writeFileSync(
            templatePath,
            'label: Design themes\nroute: /design-system/settings\n',
            'utf-8',
        );
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('materializes settings contribution yaml into the project agent-kit', () => {
        const created = writeAiditorSettingsContribution(tempDir, templatePath);
        expect(created).toEqual(AIDITOR_SETTINGS_OUTPUT_REL);

        const outputPath = path.join(tempDir, AIDITOR_SETTINGS_OUTPUT_REL);
        const parsed = yaml.load(fs.readFileSync(outputPath, 'utf-8')) as {
            label: string;
            route: string;
        };
        expect(parsed.label).toEqual('Design themes');
        expect(parsed.route).toEqual('/design-system/settings');
    });

    it('skips when output already exists unless forced', () => {
        expect(writeAiditorSettingsContribution(tempDir, templatePath)).toEqual(
            AIDITOR_SETTINGS_OUTPUT_REL,
        );
        expect(writeAiditorSettingsContribution(tempDir, templatePath)).toBeNull();
        expect(writeAiditorSettingsContribution(tempDir, templatePath, true)).toEqual(
            AIDITOR_SETTINGS_OUTPUT_REL,
        );
    });

    /**
     * Bug: bundled dist/index.js used import.meta.url in dist/ — two levels up landed in
     * node_modules/@jay-framework instead of the plugin package root.
     * Expected: find agent-kit/aiditor/settings.template.yaml at package root.
     */
    it('resolves settings template from bundled dist/index.js package layout', () => {
        const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsv-bundle-layout-'));
        const templateRel = 'agent-kit/aiditor/settings.template.yaml';
        const templateAbs = path.join(packageDir, templateRel);
        fs.mkdirSync(path.dirname(templateAbs), { recursive: true });
        fs.writeFileSync(templateAbs, 'label: Design themes\nroute: /design-system/settings\n');

        const distIndex = path.join(packageDir, 'dist', 'index.js');
        fs.mkdirSync(path.dirname(distIndex), { recursive: true });
        fs.writeFileSync(distIndex, '// bundled entry\n');

        const resolved = resolvePackagedAgentKitPath(
            templateRel,
            new URL(`file://${distIndex}`).href,
        );
        expect(resolved).toEqual(templateAbs);

        fs.rmSync(packageDir, { recursive: true, force: true });
    });
});
