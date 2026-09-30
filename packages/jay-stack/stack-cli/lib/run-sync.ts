/**
 * DL#196 §5 / Phase 3 — `jay-stack sync`: re-flatten design-system regions from their current source
 * templates, preserving every `override` facet the page owns (deterministic overwrite-with-holes; no
 * merge base, no conflict prompt). First-fill of an empty `<jay:X>` region is the degenerate no-override
 * case, so `sync` is also the materialisation command — there is no separate `add` (Q9).
 *
 * The re-flatten itself is the pure `materialise` engine (`preserveOverrides: true`); this module wires it
 * to the filesystem, merges the aggregated `@scope` CSS into the page's `<style>` non-destructively, and
 * writes changed pages back. CSS is merged per-selector: a selector the page already scopes is left as-is
 * for the author (and `jay-stack validate`'s CSS drift check) to reconcile — `mergeOverrides` governs
 * markup facets, not CSS pragmas, so sync never rewrites CSS the page may have marked.
 */

import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import chalk from 'chalk';
import { glob } from 'glob';
import { getLogger } from '@jay-framework/logger';
import { prettifyHtml, JAY_EXTENSION } from '@jay-framework/compiler-shared';
import {
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    type JayHtmlSourceFile,
} from '@jay-framework/compiler-jay-html';
import { materialise } from '@jay-framework/compiler-inline-composition';
import { parse as parseHtml } from 'node-html-parser';
import { buildMaterialiseOptions } from './materialise-context';
import { extractScopeBlock, splitScopeBlocks } from './scope-css';
import { loadConfig, getConfigWithDefaults } from './config';

export interface SyncPageResult {
    /** the re-flattened page HTML (regions filled + `@scope` CSS merged), prettified. */
    content: string;
    /** true when `content` differs from the input page beyond reformatting. */
    changed: boolean;
    /** number of design-system regions (`<jay:X>` with `template=`) in the page. */
    regions: number;
    /** hard errors — a template-inclusion cycle, or an unresolvable `template=`. */
    errors: string[];
}

/**
 * Re-flatten one page's design-system regions from source, keeping override facets. Pure: template
 * loading is injected. Returns the new page content and whether it actually changed.
 *
 * @internal Exported for testing
 */
export function syncPageContent(
    rawPage: string,
    pageDir: string,
    jayHtml: JayHtmlSourceFile,
    readFile: (absPath: string) => string | undefined,
): SyncPageResult {
    const regions = countDesignSystemRegions(jayHtml);
    if (regions === 0) {
        return { content: rawPage, changed: false, regions: 0, errors: [] };
    }

    const opts = buildMaterialiseOptions(pageDir, jayHtml, readFile, { preserveOverrides: true });
    const { html, css, errors } = materialise(rawPage, opts);
    const merged = mergeScopeCss(html, css);

    // Compare prettified forms so whitespace/formatting differences (template body vs page indentation)
    // are not counted as "a change" — only semantic re-flattening / CSS injection marks the page changed.
    const content = prettifyHtml(merged);
    const changed = content !== prettifyHtml(rawPage);
    return { content, changed, regions, errors };
}

/** Count `<jay:X>` regions whose contract carries `template=` provenance (the sync/validate subjects). */
function countDesignSystemRegions(jayHtml: JayHtmlSourceFile): number {
    const named = new Set(
        jayHtml.headlessImports.filter((i) => i.template).map((i) => i.contractName.toLowerCase()),
    );
    if (named.size === 0) return 0;
    let count = 0;
    const visit = (el: any): void => {
        for (const child of el.childNodes ?? []) {
            if (child.rawTagName === undefined) continue;
            const tag = (child.rawTagName ?? '').toLowerCase();
            if (tag.startsWith('jay:') && named.has(tag.substring(4))) count++;
            visit(child);
        }
    };
    visit(jayHtml.body);
    return count;
}

/**
 * Merge the materialiser's aggregated `@scope` CSS into the page HTML's `<style>`, per-selector and
 * non-destructively: a `@scope (.<ref>)` block already present in the page is left untouched.
 */
function mergeScopeCss(html: string, aggregatedCss: string): string {
    if (!aggregatedCss.trim()) return html;

    const root = parseHtml(html);
    const head = root.querySelector('head');
    if (!head) return html; // defensive — a page without <head> has nowhere to scope CSS

    const styleEl = head.querySelector('style');
    const existingCss = styleEl ? styleEl.textContent : '';

    const seen = new Set<string>();
    const toAppend: string[] = [];
    for (const { selector, block } of splitScopeBlocks(aggregatedCss)) {
        if (seen.has(selector)) continue; // same contract flattened into several sites
        seen.add(selector);
        if (extractScopeBlock(existingCss, selector) === undefined) toAppend.push(block);
    }
    if (toAppend.length === 0) return html;

    const newCss = [existingCss.trim(), ...toAppend].filter(Boolean).join('\n\n');
    if (styleEl) styleEl.set_content(newCss);
    else head.insertAdjacentHTML('beforeend', `<style>${newCss}</style>`);
    return root.toString();
}

/**
 * Discover the page `.jay-html` files a sync run should touch. Scanning is scoped to the project's
 * source directories (`pagesBase` + `componentsBase`), never the whole project root — otherwise sync
 * would sweep in the flattened page copies under `build/`, whose `template=` paths resolve against the
 * build tree and fail (mirrors `validate`'s config-scoped discovery).
 *
 * @internal Exported for testing
 */
export async function resolveTargets(
    projectRoot: string,
    scanDirs: string[],
    target: string | undefined,
    all: boolean,
): Promise<string[]> {
    if (target && !all) {
        // A `#ref` suffix is aspirational (DL#196 §5) — v1 syncs the whole page it names.
        const file = target.split('#')[0];
        const abs = path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
        return [abs];
    }
    const found = await Promise.all(
        scanDirs.map((dir) => glob(`${dir}/**/*${JAY_EXTENSION}`).catch(() => [] as string[])),
    );
    return [...new Set(found.flat())];
}

export async function runSync(
    target: string | undefined,
    options: { path?: string; all?: boolean; verbose?: boolean } = {},
): Promise<void> {
    const logger = getLogger();
    const projectRoot = options.path ? path.resolve(options.path) : process.cwd();

    if (target && target.includes('#')) {
        logger.important(
            chalk.yellow(
                `Per-region targeting (#ref) is not yet supported — syncing the whole page "${target.split('#')[0]}".`,
            ),
        );
    }

    const resolvedConfig = getConfigWithDefaults(loadConfig(projectRoot));
    const scanDirs = [
        path.resolve(projectRoot, resolvedConfig.devServer.pagesBase),
        path.resolve(projectRoot, resolvedConfig.devServer.componentsBase),
    ];
    const files = await resolveTargets(projectRoot, scanDirs, target, options.all ?? false);
    let filesChanged = 0;
    let regionsSynced = 0;
    let hadError = false;

    for (const file of files) {
        const relativePath = path.relative(projectRoot, file);
        let content: string;
        try {
            content = await fsp.readFile(file, 'utf-8');
        } catch {
            logger.error(chalk.red(`✗ ${relativePath}: could not read file`));
            hadError = true;
            continue;
        }

        const dirname = path.dirname(file);
        const filename = path.basename(file.replace(JAY_EXTENSION, ''));
        const parsed = await parseJayFile(
            content,
            filename,
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            projectRoot,
        );
        if (parsed.validations.length > 0 || !parsed.val) {
            logger.error(chalk.red(`✗ ${relativePath}: ${parsed.validations.join('; ')}`));
            hadError = true;
            continue;
        }

        const result = syncPageContent(content, dirname, parsed.val, (absPath) => {
            try {
                return fs.readFileSync(absPath, 'utf-8');
            } catch {
                return undefined;
            }
        });

        if (result.errors.length > 0) {
            for (const err of result.errors) logger.error(chalk.red(`✗ ${relativePath}: ${err}`));
            hadError = true;
            continue;
        }
        if (result.regions === 0) continue; // not a design-system page — silently skip

        if (result.changed) {
            await fsp.writeFile(file, result.content, 'utf-8');
            filesChanged++;
            regionsSynced += result.regions;
            logger.important(
                chalk.green(`✓ synced ${result.regions} region(s) in ${relativePath}`),
            );
        } else if (options.verbose) {
            logger.important(chalk.gray(`• ${relativePath} — already in sync`));
        }
    }

    if (filesChanged === 0) {
        logger.important('Nothing to sync.');
    } else {
        logger.important(
            chalk.green(`Synced ${regionsSynced} region(s) across ${filesChanged} file(s).`),
        );
    }

    if (hadError) process.exit(1);
}
