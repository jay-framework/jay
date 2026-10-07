import path from 'path';
import { promises as fsp } from 'fs';
import { parse } from 'node-html-parser';
import { headMetaToHeadTags, type JayHtmlHeadMeta } from '@jay-framework/stack-server-runtime';
import type {
    RouteManifest,
    RouteEntry,
    InstanceEntry,
    BuildMetadata,
    CacheEntry,
} from '@jay-framework/production-server';
import type { HTMLElement } from 'node-html-parser';
import { classifyHref, normalizePath } from './check-internal-links';

/**
 * DL#211 — Build-Output Validation (de-parked DL#210 "Check 2").
 *
 * Tier 2 — a second, opt-in validation tier (`jay-stack validate --tier-2`) that validates against an existing
 * build's artifacts — `route-manifest.json` + per-instance `*.cache.json` — WITHOUT running any render. The
 * build already enumerated every concrete instance (the "slow" phase); this pass just reads it. That is what
 * dissolves DL#210's "enumeration is slow" objection: the cost was paid at build time, so this is cheap JSON.
 *
 * What it adds over the always-on template-only Check 1:
 *  1. Template links that Check 1 *deferred* (matched a dynamic pattern) are resolved against the concrete URL
 *     set — catching links to dynamic routes with a nonexistent slug (the original `/design-log/wix/index`).
 *  2. Links rendered *inside* slow content (markdown bodies etc.) — invisible to template-only validation.
 *  3. Per-instance meta/SEO: resolve the route's `headMeta` template against the instance's slow ViewState
 *     via `headMetaToHeadTags` and validate the concrete `<title>`/`<meta>` that ships.
 *
 * No fast render: a fast/interactive-bound field is unresolved at slow (DL#189 → `''`), so meta emptiness is a
 * warning, never an error; only a literal `{binding}` leftover (never produced at any phase) is a meta error.
 */

export interface BuildOutputFinding {
    /** Concrete instance URL the finding belongs to (or the source file for template-link findings). */
    file: string;
    message: string;
    suggestion?: string;
    severity: 'error' | 'warning';
    source: 'build-output';
}

export interface BuildInstance {
    url: string;
    /** Absolute path to the instance's `*.cache.json`. */
    cacheAbsPath: string;
    pattern: string;
    headMeta?: JayHtmlHeadMeta;
}

export interface BuildOracle {
    /** Every concrete URL the build produces (routes × instances). */
    urls: Set<string>;
    /** One entry per concrete instance — drives per-instance content-link + meta checks. */
    instances: BuildInstance[];
}

const META_SUPPRESS_HINT =
    'suppress with jay-stack:\n  allow-meta-issues: true\nin the page <script type="application/jay-validations"> block';
const LINK_SUPPRESS_HINT =
    'suppress with jay-stack:\n  allow-broken-links: true\nin the page <script type="application/jay-validations"> block';

/** Matches an unresolved binding leftover like `{post.title}` left in resolved output by `resolveParts`. */
const UNRESOLVED_BINDING = /\{[A-Za-z_$][\w$]*(?:\.[\w$]+)*\}/;

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

/**
 * Reproduces `buildUrlFromManifest` from `production-server/builder/generate-sitemap.ts:55` (not exported).
 * Kept in lockstep: substitute `[[opt]]`, `[...all]`, `[p]` from params, collapse `//`, strip trailing slash.
 */
function buildUrlFromManifest(pattern: string, params: Record<string, string>): string {
    return (
        pattern
            .replace(/\[\[(\w+)\]\]/g, (_, name) => params[name] || '')
            .replace(/\[\.\.\.(\w+)\]/g, (_, name) => params[name] || '')
            .replace(/\[(\w+)\]/g, (_, name) => params[name] || '')
            .replace(/\/\/+/g, '/')
            .replace(/\/$/, '') || '/'
    );
}

/** Concrete URL for a single route instance (static route with no instances → its pattern). */
function routeInstanceUrl(route: RouteEntry, instance: InstanceEntry): string {
    return normalizePath(buildUrlFromManifest(route.pattern, instance.params));
}

/**
 * Discover the build backend dir to validate. With an explicit dir, accept either the backend dir itself or a
 * build root containing version dirs. Otherwise pick the highest `build/vN/backend` under the project root.
 * Returns null when no build is found.
 */
export async function discoverBuildBackendDir(
    projectRoot: string,
    explicit?: string,
): Promise<string | null> {
    if (explicit) {
        const abs = path.resolve(projectRoot, explicit);
        if (await fileExists(path.join(abs, 'route-manifest.json'))) return abs;
        const nested = path.join(abs, 'backend');
        if (await fileExists(path.join(nested, 'route-manifest.json'))) return nested;
        // Fall through to version discovery under the explicit build root.
        const fromRoot = await highestVersionBackend(abs);
        if (fromRoot) return fromRoot;
        return null;
    }
    return highestVersionBackend(path.join(projectRoot, 'build'));
}

async function highestVersionBackend(buildRoot: string): Promise<string | null> {
    let entries: string[];
    try {
        entries = (await fsp.readdir(buildRoot, { withFileTypes: true }))
            .filter((e) => e.isDirectory() && /^v/.test(e.name))
            .map((e) => e.name);
    } catch {
        return null;
    }
    if (entries.length === 0) return null;
    entries.sort(compareVersionDesc);
    for (const name of entries) {
        const backend = path.join(buildRoot, name, 'backend');
        if (await fileExists(path.join(backend, 'route-manifest.json'))) return backend;
    }
    return null;
}

/** Descending semver-ish compare on `vX.Y.Z` directory names (numeric-aware, highest first). */
function compareVersionDesc(a: string, b: string): number {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da !== db) return db - da;
    }
    return 0;
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fsp.access(p);
        return true;
    } catch {
        return false;
    }
}

/** Read the manifest + metadata from a backend dir. Returns null when there is no readable manifest. */
export async function loadBuildManifest(
    backendDir: string,
): Promise<{ manifest: RouteManifest; metadata: BuildMetadata | null } | null> {
    let manifest: RouteManifest;
    try {
        manifest = JSON.parse(
            await fsp.readFile(path.join(backendDir, 'route-manifest.json'), 'utf8'),
        );
    } catch {
        return null;
    }
    let metadata: BuildMetadata | null = null;
    try {
        metadata = JSON.parse(
            await fsp.readFile(path.join(backendDir, 'build-metadata.json'), 'utf8'),
        );
    } catch {
        metadata = null;
    }
    return { manifest, metadata };
}

/** Partition the manifest into the concrete URL set + the per-instance list. */
export function buildBuildOracle(manifest: RouteManifest, backendDir: string): BuildOracle {
    const urls = new Set<string>();
    const instances: BuildInstance[] = [];

    for (const route of manifest.routes) {
        const hasDynamic = route.segments.some((s) => s.type !== 'static');

        if (route.instances.length === 0) {
            // Static route with no instances — its pattern is the URL (mirrors generate-sitemap.ts:20-28).
            if (!hasDynamic) urls.add(normalizePath(route.pattern));
            continue;
        }

        for (const instance of route.instances) {
            const url = routeInstanceUrl(route, instance);
            urls.add(url);
            instances.push({
                url,
                cacheAbsPath: path.resolve(backendDir, instance.cachePath),
                pattern: route.pattern,
                headMeta: route.headMeta,
            });
        }
    }

    return { urls, instances };
}

/** Load one instance's slow ViewState from its cache file. Returns {} when unreadable. */
export async function loadSlowViewState(cacheAbsPath: string): Promise<object> {
    try {
        const cache: CacheEntry = JSON.parse(await fsp.readFile(cacheAbsPath, 'utf8'));
        return cache.slowViewState ?? {};
    } catch {
        return {};
    }
}

/**
 * Check 1′ — template links that Check 1 DEFERRED (matched a dynamic pattern) against the concrete URL set.
 *
 * Only deferred links are evaluated here: a genuinely-broken static link is already reported by Check 1, so we
 * must not double-report it. `dynamicMatchers` is Check 1's set — a link that matches one but is not a produced
 * URL (and not a public asset) is a broken dynamic-slug link.
 */
export function checkTemplateLinksAgainstBuild(args: {
    parsedFiles: Array<{
        relativePath: string;
        parsed: {
            body: HTMLElement;
            validationOverrides?: Record<string, Record<string, boolean | string[]>>;
        };
    }>;
    buildUrls: Set<string>;
    assetUrls: Set<string>;
    dynamicMatchers: RegExp[];
    baseUrl?: string;
}): BuildOutputFinding[] {
    const { parsedFiles, buildUrls, assetUrls, dynamicMatchers, baseUrl } = args;
    const findings: BuildOutputFinding[] = [];

    for (const { relativePath, parsed } of parsedFiles) {
        if (parsed.validationOverrides?.['jay-stack']?.['allow-broken-links'] === true) continue;

        for (const anchor of parsed.body.querySelectorAll('a[href]')) {
            const raw = anchor.getAttribute('href');
            if (raw === undefined || raw === null) continue;

            const verdict = classifyHref(raw, baseUrl);
            if (verdict.kind !== 'check') continue; // 'skip'/'degenerate' handled by Check 1

            const target = verdict.targetPath;
            if (buildUrls.has(target) || assetUrls.has(target)) continue;
            // Only the deferred (dynamic-matching) residue is ours; the rest is Check 1's.
            if (!dynamicMatchers.some((re) => re.test(target))) continue;

            findings.push({
                file: relativePath,
                message: `Broken link "${raw}" — matches a dynamic route but "${target}" is not among the URLs this build produces.`,
                suggestion: `Create the slug/page, fix the path, or remove the link. Otherwise ${LINK_SUPPRESS_HINT}.`,
                severity: 'error',
                source: 'build-output',
            });
        }
    }

    return findings;
}

/** Resolve a content href (including relatives) against the instance URL → a root-relative path to check. */
export function resolveContentHref(
    raw: string,
    instanceUrl: string,
    baseUrl?: string,
): { kind: 'skip' } | { kind: 'check'; targetPath: string } {
    const t = raw.trim();
    if (t === '' || t === '#' || t.startsWith('#')) return { kind: 'skip' };
    if (t.includes('{')) return { kind: 'skip' };

    // Root-relative / external / scheme cases are classified exactly like template links.
    if (t.startsWith('/') || t.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(t)) {
        const v = classifyHref(t, baseUrl);
        return v.kind === 'check' ? v : { kind: 'skip' };
    }

    // Genuine relative href (`./x`, `../x`, `x`) — resolve against the instance URL's directory.
    try {
        const u = new URL(t, 'https://_local_' + (instanceUrl === '/' ? '/' : instanceUrl));
        return { kind: 'check', targetPath: normalizePath(u.pathname) };
    } catch {
        return { kind: 'skip' };
    }
}

/** Extract every `<a href>` from the HTML-bearing string fields of a slow ViewState. */
function collectContentHrefs(viewState: object): string[] {
    const hrefs: string[] = [];
    const seen = new Set<unknown>();
    const walk = (node: unknown): void => {
        if (node == null) return;
        if (typeof node === 'string') {
            if (node.includes('<a ')) {
                const root = parse(node);
                for (const a of root.querySelectorAll('a[href]')) {
                    const h = a.getAttribute('href');
                    if (h) hrefs.push(h);
                }
            }
            return;
        }
        if (typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
        } else {
            for (const v of Object.values(node as Record<string, unknown>)) walk(v);
        }
    };
    walk(viewState);
    return hrefs;
}

/** Check 2 — links rendered inside an instance's slow content. */
export function checkContentLinks(args: {
    instanceUrl: string;
    slowViewState: object;
    buildUrls: Set<string>;
    assetUrls: Set<string>;
    baseUrl?: string;
}): BuildOutputFinding[] {
    const { instanceUrl, slowViewState, buildUrls, assetUrls, baseUrl } = args;
    const findings: BuildOutputFinding[] = [];
    const reported = new Set<string>();

    for (const raw of collectContentHrefs(slowViewState)) {
        const verdict = resolveContentHref(raw, instanceUrl, baseUrl);
        if (verdict.kind !== 'check') continue;
        const target = verdict.targetPath;
        if (buildUrls.has(target) || assetUrls.has(target)) continue;
        if (reported.has(target)) continue;
        reported.add(target);
        findings.push({
            file: instanceUrl,
            message: `Broken link "${raw}" in rendered content of ${instanceUrl} — resolves to "${target}", which this build does not produce.`,
            // Content links come from authored markdown/CMS data that often doubles as repo docs (where a
            // repo-relative "../pkg/foo.ts" is correct), so this is a warning, not a build-failing error —
            // unlike hand-authored template links (Check 1), which are site-only and stay errors.
            suggestion: `Fix the link in the source content, point it at an absolute URL, or ${LINK_SUPPRESS_HINT}.`,
            severity: 'warning',
            source: 'build-output',
        });
    }

    return findings;
}

/** Check 3 — resolve the route's headMeta against the instance's slow ViewState and validate the tags. */
export function checkInstanceMeta(args: {
    instanceUrl: string;
    headMeta?: JayHtmlHeadMeta;
    slowViewState: object;
}): BuildOutputFinding[] {
    const { instanceUrl, headMeta, slowViewState } = args;
    if (!headMeta) return [];

    const findings: BuildOutputFinding[] = [];
    const tags = headMetaToHeadTags(headMeta, slowViewState);

    const addLeftover = (what: string, value: string) =>
        findings.push({
            file: instanceUrl,
            message: `<${what}> for ${instanceUrl} resolves to "${value}" — an unresolved binding was not produced by slow render.`,
            suggestion: `Ensure the field is produced by the slow phase, or make the ${what} static.`,
            severity: 'error',
            source: 'build-output',
        });

    const addWarn = (message: string) =>
        findings.push({
            file: instanceUrl,
            message,
            suggestion: `Fix the content or ${META_SUPPRESS_HINT}.`,
            severity: 'warning',
            source: 'build-output',
        });

    for (const tag of tags) {
        if (tag.tag === 'title') {
            const value = tag.children ?? '';
            if (UNRESOLVED_BINDING.test(value)) addLeftover('title', value);
            else if (value.trim() === '') addWarn(`<title> for ${instanceUrl} is empty.`);
            else if (value.length > TITLE_MAX)
                addWarn(
                    `<title> for ${instanceUrl} is ${value.length} chars (recommend ≤ ${TITLE_MAX}).`,
                );
        } else if (tag.tag === 'meta' && tag.attrs?.name === 'description') {
            const value = tag.attrs.content ?? '';
            if (UNRESOLVED_BINDING.test(value)) addLeftover('meta name="description"', value);
            else if (value.trim() === '')
                addWarn(`<meta name="description"> for ${instanceUrl} is empty.`);
            else if (value.length > DESCRIPTION_MAX)
                addWarn(
                    `<meta name="description"> for ${instanceUrl} is ${value.length} chars (recommend ≤ ${DESCRIPTION_MAX}).`,
                );
        }
    }

    return findings;
}

/** True when any source input is newer than the build — i.e. the build is stale vs. source. */
export function isBuildStale(metadata: BuildMetadata | null, newestSourceMtimeMs: number): boolean {
    if (!metadata?.buildTimestamp) return false;
    const built = Date.parse(metadata.buildTimestamp);
    if (Number.isNaN(built)) return false;
    return newestSourceMtimeMs > built;
}

/** Newest mtime (ms) across the given source dirs. Returns 0 when none are readable. */
export async function newestSourceMtime(dirs: string[]): Promise<number> {
    let newest = 0;
    const walk = async (dir: string): Promise<void> => {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else {
                try {
                    const st = await fsp.stat(full);
                    if (st.mtimeMs > newest) newest = st.mtimeMs;
                } catch {
                    /* ignore */
                }
            }
        }
    };
    for (const dir of dirs) await walk(dir);
    return newest;
}
