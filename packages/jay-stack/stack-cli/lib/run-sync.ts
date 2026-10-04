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
import {
    splitScopeBlocks,
    tokenizeCss,
    scopeInnerBody,
    normalizeCssBody,
    type ScopeBlock,
} from './scope-css';
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
 * Reconcile the page `<style>` with the materialiser's canonical `@scope` CSS (DL#196 §4/§5). The
 * materialiser emits one coalesced block per template group (`@scope (.a, .b) { … }`); this brings the page
 * to that canonical form while preserving what the page owns:
 *
 *  - a region block **equal** to the canonical CSS is collapsed into the group's one coalesced block;
 *  - a region block that **diverges and is marked** with a `/* jay:override *​/` pragma keeps its own
 *    block, and its ref is dropped from the coalesced list — so intentional overrides are never rewritten;
 *  - a region block that **diverges without a marker** is unmarked drift: it is overwritten back to the
 *    canonical coalesced block, exactly as markup drift is re-flattened on sync;
 *  - CSS unrelated to any region (hand-authored rules, blocks for refs not on the page) is left in place.
 *
 * The result is idempotent: re-running on a canonical page reproduces it. This is what makes a
 * `validate`-clean page one that `sync` leaves unchanged (and vice-versa) for CSS.
 */
function mergeScopeCss(html: string, aggregatedCss: string): string {
    if (!aggregatedCss.trim()) return html;

    const root = parseHtml(html);
    const head = root.querySelector('head');
    if (!head) return html; // defensive — a page without <head> has nowhere to scope CSS

    const styleEl = head.querySelector('style');
    const existingCss = styleEl ? styleEl.textContent : '';

    // Index the canonical groups by member ref: its group block and the group's normalized body.
    const groups = splitScopeBlocks(aggregatedCss);
    const groupOf = new Map<string, ScopeBlock>();
    const canonicalBody = new Map<string, string>();
    for (const g of groups) {
        const nb = normalizeCssBody(scopeInnerBody(g.block));
        for (const s of g.selectors) {
            groupOf.set(s, g);
            canonicalBody.set(s, nb);
        }
    }

    // Walk the page CSS: keep raw text and unrelated blocks; from each region block keep only the members
    // whose CSS diverges from canonical *and* carries a `/* jay:override *​/` pragma. A block that
    // diverges without a marker is unmarked drift — overwritten back to canonical on sync, exactly as
    // markup drift is re-flattened. Members equal to canonical are also dropped and re-emitted below as
    // their group's single coalesced block. (This is what lets sync *migrate* a page to a new canonical
    // form, and keeps `validate`-clean ⇔ `sync`-clean for CSS.)
    const overridden = new Set<string>();
    const kept: string[] = [];
    for (const seg of tokenizeCss(existingCss)) {
        if (seg.type === 'raw') {
            if (seg.text.trim()) kept.push(seg.text.trim());
            continue;
        }
        const marked = hasOverrideMarker(seg.block);
        const body = normalizeCssBody(scopeInnerBody(seg.block));
        const keepMembers = seg.selectors.filter((s) => {
            if (!groupOf.has(s)) return true; // a ref not managed this run — leave it alone
            const diverges = marked && body !== canonicalBody.get(s);
            if (diverges) overridden.add(s);
            return diverges;
        });
        if (keepMembers.length === seg.selectors.length) kept.push(seg.block);
        else if (keepMembers.length > 0) kept.push(narrowScopeBlock(seg.block, keepMembers));
        // else: every member is plain — drop the block; the coalesced group block replaces it.
    }

    // Emit one coalesced block per group, scoped to the members the page did not override.
    const appended: string[] = [];
    for (const g of groups) {
        const plain = g.selectors.filter((s) => !overridden.has(s));
        if (plain.length === 0) continue;
        appended.push(
            plain.length === g.selectors.length ? g.block : narrowScopeBlock(g.block, plain),
        );
    }

    const newCss = [...kept, ...appended].filter(Boolean).join('\n\n');
    if (newCss === existingCss.trim()) return html; // nothing to change
    if (styleEl) styleEl.set_content(newCss);
    else head.insertAdjacentHTML('beforeend', `<style>${newCss}</style>`);
    return root.toString();
}

/** True when a CSS block carries a `/* jay:override … *​/` pragma (a whole-rule or per-declaration marker). */
function hasOverrideMarker(block: string): boolean {
    return /\/\*\s*jay:override\b/.test(block);
}

/**
 * Rewrite a coalesced `@scope (…)` block's scope-start to only `selectors` (re-narrowing the list),
 * preserving any DL#203 `to (…)` scoping limit that follows the selector list.
 *
 * @internal Exported for testing
 */
export function narrowScopeBlock(block: string, selectors: string[]): string {
    return block.replace(
        /^(@scope\s*\()\s*[^)]*?\s*(\)(?:\s*to\s*\([^)]*\))?\s*\{)/,
        `$1${selectors.join(', ')}$2`,
    );
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
