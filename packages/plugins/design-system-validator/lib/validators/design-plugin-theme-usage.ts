/**
 * DL#238 — per-page checks of how a page relates to the `styles` of the local plugins it uses:
 * a hand-linked copy of a plugin stylesheet, theme-vs-page global name clashes, and a plugin used
 * only inside a headfull child (whose theme Phase 1 does not include). Reads the page source and,
 * for `DS-THEME-VIA-CHILD`, each headfull child's jay-html itself. All findings are warnings.
 */
import fs from 'fs';
import path from 'path';
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import {
    extractStyleBlocks,
    findLocalPluginTheme,
    importedPluginNames,
    readExistingStyles,
    tagAttributes,
    type LocalPluginTheme,
} from '../local-plugin-themes.js';

export const validatePluginThemeUsage: JayHtmlValidatorFn = (ctx) => {
    const pagePath = path.resolve(ctx.projectRoot, ctx.filePath);
    if (!fs.existsSync(pagePath)) return [];
    const page = { html: fs.readFileSync(pagePath, 'utf-8'), dir: path.dirname(pagePath) };
    const usedThemes = themesWithStyles(ctx.projectRoot, importedPluginNames(page.html));
    return [
        ...handLinkedThemes(page, usedThemes),
        ...nameClashes(page, usedThemes),
        ...themesOnlyInChildren(ctx.projectRoot, page, usedThemes),
    ];
};

interface PageSource {
    html: string;
    dir: string;
}

function themesWithStyles(projectRoot: string, pluginNames: string[]): LocalPluginTheme[] {
    return pluginNames
        .map((name) => findLocalPluginTheme(projectRoot, name))
        .filter((theme): theme is LocalPluginTheme => !!theme?.declaresStyles);
}

function localStylesheetLinks(page: PageSource): Array<{ href: string; absolutePath: string }> {
    return tagAttributes(page.html, 'link', 'href', /rel\s*=\s*["']stylesheet["']/i)
        .filter((href) => !/^(https?:)?\/\//.test(href))
        .map((href) => ({ href, absolutePath: path.resolve(page.dir, href) }));
}

function owningTheme(themes: LocalPluginTheme[], absolutePath: string) {
    return themes.find((theme) => theme.styleFiles.some((f) => f.absolutePath === absolutePath));
}

function handLinkedThemes(
    page: PageSource,
    themes: LocalPluginTheme[],
): JayHtmlValidationFinding[] {
    return localStylesheetLinks(page).flatMap(({ href, absolutePath }) => {
        const theme = owningTheme(themes, absolutePath);
        if (!theme) return [];
        return [
            {
                severity: 'warning' as const,
                message: `DS-THEME-HAND-LINKED: "${href}" is already loaded from plugin "${theme.folder}" \`styles\` — remove this <link>`,
                suggestion:
                    'Plugin styles are added automatically to every page that imports a component of the plugin.',
            },
        ];
    });
}

function nameClashes(page: PageSource, themes: LocalPluginTheme[]): JayHtmlValidationFinding[] {
    const pageNames = new Set(globalNames(pageOwnCss(page, themes)).map(nameLabel));
    return themes.flatMap((theme) =>
        readExistingStyles(theme)
            .flatMap((style) => globalNames(style.css))
            .filter((name) => pageNames.has(nameLabel(name)))
            .map((name) => ({
                severity: 'warning' as const,
                message: `DS-THEME-NAME-CLASH: ${nameLabel(name)} is defined both by plugin "${theme.folder}" \`styles\` and by this page`,
                suggestion: 'Rename one of them — @keyframes and @font-face names are global.',
            })),
    );
}

/** The page's `<head><style>` CSS plus its linked local CSS that is not a plugin stylesheet. */
function pageOwnCss(page: PageSource, themes: LocalPluginTheme[]): string {
    const linked = localStylesheetLinks(page)
        .filter(({ absolutePath }) => !owningTheme(themes, absolutePath))
        .filter(({ absolutePath }) => fs.existsSync(absolutePath))
        .map(({ absolutePath }) => fs.readFileSync(absolutePath, 'utf-8'));
    return [...linked, ...extractStyleBlocks(page.html).map((block) => block.css)].join('\n');
}

interface GlobalName {
    kind: '@keyframes' | '@font-face';
    name: string;
}

function globalNames(css: string): GlobalName[] {
    const keyframes = [...css.matchAll(/@keyframes\s+([^\s{]+)/g)].map((m) => ({
        kind: '@keyframes' as const,
        name: m[1],
    }));
    const fontFaces = [
        ...css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^;'"}]+)/g),
    ].map((m) => ({ kind: '@font-face' as const, name: m[1].trim() }));
    return [...keyframes, ...fontFaces];
}

function nameLabel(name: GlobalName): string {
    return `${name.kind} "${name.name}"`;
}

function themesOnlyInChildren(
    projectRoot: string,
    page: PageSource,
    usedThemes: LocalPluginTheme[],
): JayHtmlValidationFinding[] {
    const used = new Set(usedThemes.map((theme) => theme.folder));
    return tagAttributes(page.html, 'script', 'src', /application\/jay-headfull/).flatMap((src) => {
        const childHtml = readChildJayHtml(page.dir, src);
        if (!childHtml) return [];
        return themesWithStyles(projectRoot, importedPluginNames(childHtml))
            .filter((theme) => !used.has(theme.folder))
            .map((theme) => ({
                severity: 'warning' as const,
                message: `DS-THEME-VIA-CHILD: theme of "${theme.folder}" not loaded on this page — it is used only inside ${src}`,
                suggestion: `Import a component from ${theme.folder} on the page (e.g. <script type="application/jay-headless" plugin="${theme.folder}" …>) so its \`styles\` are included.`,
            }));
    });
}

/** A headfull child's jay-html: `<src>.jay-html` or `<src>/<basename>.jay-html`. */
function readChildJayHtml(pageDir: string, src: string): string | undefined {
    const base = path.resolve(pageDir, src);
    const candidates = [`${base}.jay-html`, path.join(base, `${path.basename(base)}.jay-html`)];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    return found && fs.readFileSync(found, 'utf-8');
}
