import { describe, it, expect } from 'vitest';
import path from 'path';
import { validatePluginThemes, validatePluginThemeUsage } from '../../lib/tools';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

/** DL#238 — `DS-*` checks for a local plugin's page-wide `styles`. All warnings. */
const projectRoot = path.resolve(__dirname, '../fixtures/plugin-themes');

describe('design-plugin-themes project validator', () => {
    it('reports missing theme, missing file, plain :root and token without fallback', async () => {
        expect(await validatePluginThemes({ projectRoot })).toEqual([
            {
                severity: 'warning',
                file: 'src/plugins/bare-ds/plugin.yaml',
                message:
                    'DS-THEME-MISSING: plugin "bare-ds" templates use --bare-ds-* tokens but plugin.yaml declares no `styles`',
                suggestion:
                    'Put the tokens in a stylesheet under `:where(:root) { … }` and list it in plugin.yaml `styles: [theme.css]`.',
            },
            {
                severity: 'warning',
                file: 'src/plugins/bare-ds/card.jay-html',
                message:
                    "DS-TOKEN-NO-FALLBACK: var(--bare-ds-ink) at line 5 has no fallback and is not defined in the plugin's `styles`",
                suggestion:
                    'Define --bare-ds-ink in the plugin stylesheet, or add a fallback: var(--bare-ds-ink, <value>).',
            },
            {
                severity: 'warning',
                file: 'src/plugins/lost-ds/plugin.yaml',
                message:
                    'DS-THEME-FILE-MISSING: plugin "lost-ds" declares styles file "nope.css", which does not exist',
                suggestion: 'Create src/plugins/lost-ds/nope.css or remove it from `styles`.',
            },
            {
                severity: 'warning',
                file: 'src/plugins/root-ds/theme.css',
                message:
                    'DS-THEME-ROOT-SPECIFICITY: custom properties on plain `:root` at line 2 — a site `:root` override may lose to them',
                suggestion:
                    'Declare plugin tokens under `:where(:root) { … }` (specificity 0) so site overrides always win.',
            },
        ]);
    });
});

describe('design-plugin-theme-usage page validator', () => {
    function pageContext(page: string): JayHtmlValidationContext {
        return {
            body: undefined,
            filePath: `src/pages/${page}/page.jay-html`,
            projectRoot,
            headlessImports: [],
        };
    }

    it('reports nothing for a page that imports the plugin and does not hand-link it', async () => {
        expect(await validatePluginThemeUsage(pageContext('ok'))).toEqual([]);
    });

    it('hints when a page hand-links a plugin stylesheet', async () => {
        expect(await validatePluginThemeUsage(pageContext('hand'))).toEqual([
            {
                severity: 'warning',
                message:
                    'DS-THEME-HAND-LINKED: "../../plugins/good-ds/theme.css" is already loaded from plugin "good-ds" `styles` — remove this <link>',
                suggestion:
                    'Plugin styles are added automatically to every page that imports a component of the plugin.',
            },
        ]);
    });

    it('warns when a theme @keyframes name is also defined by the page', async () => {
        expect(await validatePluginThemeUsage(pageContext('clash'))).toEqual([
            {
                severity: 'warning',
                message:
                    'DS-THEME-NAME-CLASH: @keyframes "good-pulse" is defined both by plugin "good-ds" `styles` and by this page',
                suggestion: 'Rename one of them — @keyframes and @font-face names are global.',
            },
        ]);
    });

    it('warns when a plugin is used only inside a headfull child (reads the child file)', async () => {
        expect(await validatePluginThemeUsage(pageContext('child'))).toEqual([
            {
                severity: 'warning',
                message:
                    'DS-THEME-VIA-CHILD: theme of "good-ds" not loaded on this page — it is used only inside ../../components/card-holder/card-holder',
                suggestion:
                    'Import a component from good-ds on the page (e.g. <script type="application/jay-headless" plugin="good-ds" …>) so its `styles` are included.',
            },
        ]);
    });
});
