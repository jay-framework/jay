import { parseJayFile, JAY_IMPORT_RESOLVER, JayImportResolver } from '../lib';
import { JayComponentType } from '@jay-framework/compiler-shared';
import { stripMargin } from './test-utils/strip-margin';
import path from 'path';
import fs from 'fs';
import { vi } from 'vitest';

/**
 * DL#238 — a plugin's `styles` (plugin.yaml) travel with its components: a page that imports a
 * component of the plugin gets the plugin stylesheet inlined once, before the page's own CSS, with
 * remote `@import`s hoisted to the top.
 */
describe('plugin styles in page CSS (DL#238)', () => {
    const projectRoot = path.resolve(__dirname, 'fixtures/plugin-styles');
    const pagesDir = path.join(projectRoot, 'src/pages');
    const themePath = path.join(projectRoot, 'src/plugins/brand-ds/theme.css');

    function pageWith(head: string, body = '<body><div>page</div></body>') {
        return stripMargin(
            ` <html>
                |   <head>
                |${head}
                |     <script type="application/jay-data">
                |data:
                |     </script>
                |   </head>
                |   ${body}
                | </html>`,
        );
    }

    const expectedCss = (name: string) =>
        fs.readFileSync(path.join(projectRoot, 'expected', `${name}.css`), 'utf-8').trimEnd();

    const BRAND_BUTTON = `<script type="application/jay-headless" plugin="brand-ds" contract="button" key="btn"></script>`;

    async function parsePage(html: string, resolver: JayImportResolver = JAY_IMPORT_RESOLVER) {
        return parseJayFile(html, 'Page', pagesDir, {}, resolver, projectRoot);
    }

    it('prepends the plugin theme before page CSS and hoists every remote @import, plugin first', async () => {
        const jayFile = await parsePage(
            pageWith(
                `${BRAND_BUTTON}
                |<link rel="stylesheet" href="page.css">
                |<style>
                |@import url('https://fonts.googleapis.com/css2?family=Lora');
                |.local { margin: 0; }
                |</style>`,
            ),
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toEqual(expectedCss('theme-before-page'));
        expect(jayFile.val.linkedCssFiles).toEqual([path.join(pagesDir, 'page.css'), themePath]);
    });

    it('records the plugin name on the headless import', async () => {
        const jayFile = await parsePage(pageWith(BRAND_BUTTON));
        expect(jayFile.val.headlessImports.map((_) => _.pluginName)).toEqual(['brand-ds']);
    });

    it('adds no plugin CSS to a page that does not import the plugin', async () => {
        const jayFile = await parsePage(pageWith(`<link rel="stylesheet" href="page.css">`));

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toEqual(expectedCss('page-without-plugin'));
    });

    it('includes the theme once when the plugin is imported twice', async () => {
        const jayFile = await parsePage(
            pageWith(
                `${BRAND_BUTTON}
                |<script type="application/jay-headless" plugin="brand-ds" contract="button" key="btn2" as="pill-button"></script>`,
            ),
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toEqual(expectedCss('theme-only'));
    });

    it('skips a hand-linked copy of the plugin theme so it appears once', async () => {
        const jayFile = await parsePage(
            pageWith(
                `${BRAND_BUTTON}
                |<link rel="stylesheet" href="../plugins/brand-ds/theme.css">`,
            ),
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toEqual(expectedCss('theme-only'));
        expect(jayFile.val.linkedCssFiles).toEqual([themePath]);
    });

    it('does not pull the theme in when the plugin is used only inside a headfull child', async () => {
        const resolver: JayImportResolver = {
            ...JAY_IMPORT_RESOLVER,
            analyzeExportedTypes: () => [new JayComponentType('Child', [])],
        };
        const jayFile = await parsePage(
            pageWith(
                `<script type="application/jay-headfull" src="../components/child/child" names="Child"></script>`,
            ),
            resolver,
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toBeUndefined();
    });

    it('does not add the styles of a global plugin the page does not import', async () => {
        const jayFile = await parsePage(pageWith(BRAND_BUTTON));

        expect(jayFile.val.css).toEqual(expectedCss('theme-only'));
    });

    it('warns and still compiles when a declared styles file is missing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const jayFile = await parsePage(
            pageWith(
                `<script type="application/jay-headless" plugin="broken-ds" contract="tag" key="tag"></script>
                |<style>.local { margin: 0; }</style>`,
            ),
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val).toBeDefined();
        expect(jayFile.val.css).toEqual('.local { margin: 0; }');
        expect(warn).toHaveBeenCalledWith(
            `[jay] plugin "broken-ds" styles file not found: ${path.join(projectRoot, 'src/plugins/broken-ds/missing.css')} — skipped`,
        );
        warn.mockRestore();
    });

    it('does not fail when a theme @keyframes name is also defined in page CSS', async () => {
        const jayFile = await parsePage(
            pageWith(
                `${BRAND_BUTTON}
                |<style>@keyframes brand-spin { to { opacity: 0; } }</style>`,
            ),
        );

        expect(jayFile.validations).toEqual([]);
        expect(jayFile.val.css).toEqual(expectedCss('theme-keyframes-clash'));
    });
});
