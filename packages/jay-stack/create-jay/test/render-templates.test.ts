import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAgentGuidance, renderHomePage, renderSections } from '../lib/render-templates.js';
import { PLUGINS } from '../lib/plugins.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const readTemplate = (name: string): string =>
    fs.readFileSync(path.join(testDir, '..', 'templates', name), 'utf-8');
const readFixture = (name: string): string =>
    fs.readFileSync(path.join(testDir, 'fixtures', name), 'utf-8');
const pluginsNamed = (...names: string[]) => PLUGINS.filter((p) => names.includes(p.name));

describe('renderHomePage', () => {
    it('uses the UI Kit letter-split hero when UI Kit is selected', () => {
        const selected = pluginsNamed('@jay-framework/ui-kit', '@jay-framework/wix-members');
        expect(renderHomePage(readTemplate('page.jay-html'), 'my-site', selected)).toEqual(
            readFixture('home-page-with-ui-kit.jay-html'),
        );
    });

    /**
     * Bug: a fresh project fails `jay-stack validate` with "Plugin @jay-framework/ui-kit not found".
     * Found in: design-log/235 - boolean attributes and fresh-project validation.md
     * Expected: without UI Kit selected, the home page does not import or use ui-kit.
     * Actual: the home page always imported the ui-kit letter-split headless component.
     */
    it('does not reference UI Kit when it is not selected', () => {
        const selected = pluginsNamed('@jay-framework/wix-members');
        expect(renderHomePage(readTemplate('page.jay-html'), 'my-site', selected)).toEqual(
            readFixture('home-page-without-ui-kit.jay-html'),
        );
    });
});

describe('renderAgentGuidance', () => {
    /**
     * Bug: the generated CLAUDE.md told npm users to run `yarn setup` / `yarn agent-kit`.
     * Found in: design-log/235 - boolean attributes and fresh-project validation.md
     * Expected: commands use the package manager that created the project.
     */
    it('uses npm run for a project created with npm', () => {
        expect(renderAgentGuidance(readTemplate('CLAUDE.md'), 'npm')).toEqual(
            readFixture('agent-guidance-npm.md'),
        );
    });

    it('uses yarn for a project created with yarn', () => {
        expect(renderAgentGuidance(readTemplate('CLAUDE.md'), 'yarn')).toEqual(
            readFixture('agent-guidance-yarn.md'),
        );
    });
});

describe('renderSections', () => {
    it('keeps # sections when the flag is true and ^ sections when it is false', () => {
        const template = 'a\n{{#on}}\nyes\n{{/on}}\n{{^on}}\nno\n{{/on}}\nb\n';
        expect(renderSections(template, { on: true })).toEqual('a\nyes\nb\n');
        expect(renderSections(template, { on: false })).toEqual('a\nno\nb\n');
    });

    it('throws on an unknown section flag', () => {
        expect(() => renderSections('{{#typo}}\nx\n{{/typo}}\n', { on: true })).toThrow(
            'Unknown template section flag "typo"',
        );
    });
});
