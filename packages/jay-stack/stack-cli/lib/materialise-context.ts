/**
 * DL#196 — wire the `@jay-framework/compiler-inline-composition` materialiser to the filesystem.
 *
 * The materialiser (`materialise` / `mergeOverrides`) is pure: template loading and the contract→template
 * map are injected. This module supplies the CLI-side implementation, shared by `jay-stack sync` (re-flatten)
 * and `jay-stack validate` (recursion detection), so both resolve `template=` provenance the same way.
 *
 * Only **design-system elements** — nested `<jay:X>` regions whose `application/jay-headless` import
 * carries `template=` — are resolvable. A region without `template=` is a plain nested/keyed component and
 * `resolveTemplate` returns null for it (the materialiser leaves it as authored).
 */

import path from 'path';
import { parse as parseHtml } from 'node-html-parser';
import type { JayHtmlSourceFile } from '@jay-framework/compiler-jay-html';
import type {
    LoadedTemplate,
    MaterialiseOptions,
} from '@jay-framework/compiler-inline-composition';

/**
 * Build the `resolveTemplate` / `loadTemplate` pair for a page from its headless imports.
 *
 * The contract→path map is seeded from the page's own `template=` imports (a global name→path map, as the
 * materialiser expects). A nested `<jay:Y>` inside a flattened template body resolves through the same map,
 * so both the page and any nested design-system element it declares must carry a `template=` import — the
 * same requirement that lets a `<jay:Y>` resolve its contract at compile time.
 *
 * @param pageDir  directory of the page `.jay-html` (template paths resolve relative to it)
 * @param jayHtml  the parsed page
 * @param readFile read an absolute path to a UTF-8 string, or undefined when it cannot be read
 */
export function buildMaterialiseOptions(
    pageDir: string,
    jayHtml: JayHtmlSourceFile,
    readFile: (absPath: string) => string | undefined,
    extra: Pick<MaterialiseOptions, 'preserveOverrides' | 'prettify' | 'scopeSelector'> = {},
): MaterialiseOptions {
    const nameToPath = new Map<string, string>();
    for (const imp of jayHtml.headlessImports) {
        if (imp.template) {
            nameToPath.set(imp.contractName.toLowerCase(), path.resolve(pageDir, imp.template));
        }
    }

    return {
        resolveTemplate: (name) => nameToPath.get(name.toLowerCase()) ?? null,
        loadTemplate: (absPath): LoadedTemplate | null => {
            const content = readFile(absPath);
            if (content === undefined) return null;
            const root = parseHtml(content);
            const body = root.querySelector('body');
            const styles = root.querySelectorAll('style');
            const css = styles.map((s) => s.textContent).join('\n\n');
            return {
                body: body ? body.innerHTML : content,
                css: css.trim() ? css : undefined,
            };
        },
        ...extra,
    };
}
