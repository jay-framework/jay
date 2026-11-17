/**
 * Reading local plugins' page-wide `styles` (DL#238) for the `DS-THEME-*` validators. Local plugins
 * only (`src/plugins/<folder>/`): NPM plugins are not checked.
 */
import fs from 'fs';
import path from 'path';
import { LOCAL_PLUGIN_PATH, loadPluginManifest } from '@jay-framework/compiler-shared';

export interface PluginStyleFile {
    declared: string;
    absolutePath: string;
    exists: boolean;
}

export interface LocalPluginTheme {
    /** Folder name under src/plugins — what `plugin="x"` resolves. */
    folder: string;
    dir: string;
    declaresStyles: boolean;
    styleFiles: PluginStyleFile[];
}

/** An inline CSS block and the 1-based line of its first character in the source file. */
export interface CssBlock {
    css: string;
    startLine: number;
}

export function listLocalPluginThemes(projectRoot: string): LocalPluginTheme[] {
    const pluginsRoot = path.join(projectRoot, LOCAL_PLUGIN_PATH);
    if (!fs.existsSync(pluginsRoot)) return [];
    return fs
        .readdirSync(pluginsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .flatMap((folder) => {
            const theme = readLocalPluginTheme(path.join(pluginsRoot, folder), folder);
            return theme ? [theme] : [];
        });
}

export function findLocalPluginTheme(
    projectRoot: string,
    folder: string,
): LocalPluginTheme | undefined {
    return readLocalPluginTheme(path.join(projectRoot, LOCAL_PLUGIN_PATH, folder), folder);
}

function readLocalPluginTheme(dir: string, folder: string): LocalPluginTheme | undefined {
    const manifest = loadPluginManifest(dir);
    if (!manifest) return undefined;
    const declared = Array.isArray(manifest.styles) ? manifest.styles : [];
    return {
        folder,
        dir,
        declaresStyles: declared.length > 0,
        styleFiles: declared.map((style) => {
            const absolutePath = path.resolve(dir, style);
            return { declared: style, absolutePath, exists: fs.existsSync(absolutePath) };
        }),
    };
}

export function readExistingStyles(theme: LocalPluginTheme): Array<{ path: string; css: string }> {
    return theme.styleFiles
        .filter((file) => file.exists)
        .map((file) => ({
            path: file.absolutePath,
            css: fs.readFileSync(file.absolutePath, 'utf-8'),
        }));
}

/** `<style>` blocks of an HTML source, with their start line. */
export function extractStyleBlocks(html: string): CssBlock[] {
    return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => {
        const cssOffset = match.index! + match[0].indexOf('>') + 1;
        return { css: match[1], startLine: lineAt(html, cssOffset) };
    });
}

/** Values of `attribute` on every `<tag …>` whose attributes match `filter`. */
export function tagAttributes(html: string, tag: string, attribute: string, filter?: RegExp) {
    const values: string[] = [];
    for (const match of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'))) {
        const attributes = match[1];
        if (filter && !filter.test(attributes)) continue;
        const value = attributes.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
        if (value) values.push(value[1]);
    }
    return values;
}

/** Plugin names a jay-html file imports directly via `plugin="x"` headless imports. */
export function importedPluginNames(html: string): string[] {
    return [...new Set(tagAttributes(html, 'script', 'plugin', /application\/jay-headless/))];
}

function lineAt(text: string, offset: number): number {
    return text.slice(0, offset).split('\n').length;
}
