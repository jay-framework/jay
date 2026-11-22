import path from 'path';
import fsSync from 'fs';
import { resolvePluginStyles } from '@jay-framework/compiler-shared';
import type { JayHeadlessImports } from './jay-html-source-file';

/** A plugin stylesheet ready to be prepended to a page's CSS (DL#238). */
export interface PluginStylePart {
    path: string;
    css: string;
}

/**
 * Inlines relative `@import`s (recursively, cycle-safe). Remote (`http(s)://`, `//`) imports are
 * left where they are; {@link assemblePageCss} hoists them.
 */
export function resolveNestedCssImports(
    css: string,
    cssDir: string,
    visited?: Set<string>,
): string {
    if (!css.includes('@import')) return css;
    const seen = visited ?? new Set<string>();

    return css.replace(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?;?/g, (match, importPath) => {
        if (importPath.startsWith('http') || importPath.startsWith('//')) return match;
        const resolved = path.resolve(cssDir, importPath);
        if (seen.has(resolved)) return `/* circular import: ${importPath} */`;
        seen.add(resolved);
        try {
            const imported = fsSync.readFileSync(resolved, 'utf-8');
            return `/* @import ${importPath} */\n${resolveNestedCssImports(imported, path.dirname(resolved), seen)}`;
        } catch {
            return `/* @import not found: ${importPath} */`;
        }
    });
}

/**
 * Plugins whose `styles` this page needs: those of its own `plugin="x"` headless imports, deduped
 * in first-import order. Headfull children and `global` plugins are not walked (DL#238, Later).
 */
export function collectUsedPluginNames(headlessImports: JayHeadlessImports[]): string[] {
    const names = headlessImports.map((_) => _.pluginName).filter((name): name is string => !!name);
    return [...new Set(names)];
}

/**
 * Reads each used plugin's stylesheets (deduped by absolute path). A missing file is warned about
 * and skipped — plugin CSS never fails the page compile.
 */
export function loadPluginStyleParts(
    projectRoot: string,
    pluginNames: string[],
): PluginStylePart[] {
    const parts: PluginStylePart[] = [];
    const seenPaths = new Set<string>();
    for (const pluginName of pluginNames) {
        for (const stylePath of resolvePluginStyles(projectRoot, pluginName)) {
            if (seenPaths.has(stylePath)) continue;
            seenPaths.add(stylePath);
            const css = readStyleFile(pluginName, stylePath);
            if (css === undefined) continue;
            const body = resolveNestedCssImports(css, path.dirname(stylePath));
            parts.push({
                path: stylePath,
                css: `/* Plugin CSS: ${pluginName}/${path.basename(stylePath)} */\n${body}`,
            });
        }
    }
    return parts;
}

function readStyleFile(pluginName: string, stylePath: string): string | undefined {
    try {
        return fsSync.readFileSync(stylePath, 'utf-8');
    } catch {
        console.warn(`[jay] plugin "${pluginName}" styles file not found: ${stylePath} — skipped`);
        return undefined;
    }
}

const REMOTE_IMPORT =
    /@import\s+(?:url\(\s*['"]?(?:https?:)?\/\/[^)]*\)|['"](?:https?:)?\/\/[^'"]*['"])[^;]*;/g;

/**
 * Final page CSS: every remote `@import` (from any part, deduped by exact text, original order,
 * plugin parts first) → plugin stylesheets → page parts. Browsers ignore an `@import` that follows
 * other rules, so imports must be hoisted out of every part before the parts are joined.
 */
export function assemblePageCss(cssParts: string[]): string | undefined {
    const imports: string[] = [];
    const bodies = cssParts
        .map((part) =>
            part.replace(REMOTE_IMPORT, (match) => {
                const statement = match.trim();
                if (!imports.includes(statement)) imports.push(statement);
                return '';
            }),
        )
        .map(trimPartBody)
        .filter((body) => body.length > 0);
    const blocks = [...(imports.length ? [imports.join('\n')] : []), ...bodies];
    return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

/** Trims a part, and the blank lines a hoisted import leaves under a part's header comment. */
function trimPartBody(part: string): string {
    return part.replace(/^(\/\*[^*]*\*\/\n)\s+/, '$1').trim();
}
