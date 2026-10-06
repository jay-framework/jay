import path from 'path';
import { promises as fsp } from 'fs';
import type { HTMLElement } from 'node-html-parser';
import { scanRoutes, JayRouteParamType, type JayRoute } from '@jay-framework/stack-route-scanner';

/**
 * DL#210 — Check 1: broken internal link validation (validate-time).
 *
 * Resolves every internal `<a href>` against the set of things we can know statically — concrete routes
 * (static pages + DL#156 static overrides) and public assets. Anything that resolves to nothing is a broken
 * link: a degenerate placeholder (`#`, empty), a typo, or a link to a page/asset that does not exist.
 *
 * The one thing deferred (parked Check 2) is an href that matches a *dynamic* route pattern (`/blog/[slug]`):
 * we cannot know whether the concrete slug is generated without running `loadParams`, so such links are
 * accepted here rather than flagged.
 */

export interface LinkFinding {
    file: string;
    message: string;
    suggestion?: string;
}

export interface RouteOracle {
    /** Concrete URLs that definitely exist: static pages + fully-inferred DL#156 static overrides. */
    staticUrls: Set<string>;
    /** Matchers for routes with ≥1 unresolved dynamic segment — a match means "defer to Check 2". */
    dynamicMatchers: RegExp[];
    /** Resolved absolute page-file path → its own concrete URL (for self-link detection). */
    selfUrlByPath: Map<string, string>;
}

const SUPPRESS_KEY = 'allow-broken-links';
const SUPPRESS_HINT =
    'suppress with jay-stack:\n  allow-broken-links: true\nin a <script type="application/jay-validations"> block';

/** Normalize a URL path: drop query/hash, collapse `//`, strip trailing slash (except root). */
export function normalizePath(p: string): string {
    let s = p.split('#')[0].split('?')[0];
    s = s.replace(/\/{2,}/g, '/');
    if (s.length > 1) s = s.replace(/\/+$/, '');
    return s === '' ? '/' : s;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a concrete URL for a route, resolving dynamic segments from DL#156 `inferredParams`.
 * Returns null if any dynamic segment has no inferred value (i.e. a genuinely dynamic route).
 */
function routeToConcreteUrl(route: JayRoute): string | null {
    const parts: string[] = [];
    for (const seg of route.segments) {
        if (typeof seg === 'string') {
            parts.push(seg);
        } else {
            const v = route.inferredParams?.[seg.name];
            if (v === undefined) return null;
            parts.push(v);
        }
    }
    return normalizePath('/' + parts.join('/'));
}

/** Build an anchored regex matching any concrete URL produced by a dynamic route pattern. */
function routeToRegex(route: JayRoute): RegExp {
    let pattern = '';
    for (const seg of route.segments) {
        if (typeof seg === 'string') {
            pattern += '/' + escapeRegExp(seg);
        } else if (seg.type === JayRouteParamType.optional) {
            pattern += '(?:/[^/]+)?';
        } else if (seg.type === JayRouteParamType.catchAll) {
            pattern += '(?:/[^/]+)+';
        } else {
            pattern += '/[^/]+';
        }
    }
    if (pattern === '') pattern = '/';
    return new RegExp('^' + pattern + '$');
}

/** Scan the pages tree for routes and partition into concrete URLs + dynamic matchers. Never throws. */
export async function buildRouteOracle(pagesBase: string): Promise<RouteOracle> {
    let routes: JayRoute[] = [];
    try {
        routes = await scanRoutes(pagesBase, {
            jayHtmlFilename: 'page.jay-html',
            compFilename: 'page.ts',
        });
    } catch {
        routes = [];
    }

    const staticUrls = new Set<string>();
    const dynamicMatchers: RegExp[] = [];
    const selfUrlByPath = new Map<string, string>();
    for (const route of routes) {
        const concrete = routeToConcreteUrl(route);
        if (concrete !== null) {
            staticUrls.add(concrete);
            if (route.jayHtmlPath) selfUrlByPath.set(path.resolve(route.jayHtmlPath), concrete);
        }
        if (route.segments.some((s) => typeof s !== 'string')) {
            dynamicMatchers.push(routeToRegex(route));
        }
    }
    return { staticUrls, dynamicMatchers, selfUrlByPath };
}

/** Recursively collect public-folder files as root-relative URLs (`/images/logo.svg`). Never throws. */
export async function collectPublicAssets(publicFolder: string): Promise<Set<string>> {
    const assets = new Set<string>();
    async function walk(dir: string, prefix: string): Promise<void> {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await walk(path.join(dir, entry.name), rel);
            } else {
                assets.add('/' + rel);
            }
        }
    }
    await walk(publicFolder, '');
    return assets;
}

function originOf(baseUrl: string): string | undefined {
    try {
        return new URL(baseUrl).origin;
    } catch {
        return undefined;
    }
}

type HrefVerdict =
    { kind: 'skip' } | { kind: 'degenerate' } | { kind: 'check'; targetPath: string };

/**
 * Classify a raw href into: skip (not an internal route link), degenerate (`#`/empty placeholder), or
 * check (a root-relative/same-origin path to resolve against the oracle).
 */
export function classifyHref(raw: string, baseUrl?: string): HrefVerdict {
    if (raw.includes('{')) return { kind: 'skip' }; // dynamic binding — not statically resolvable
    const t = raw.trim();
    if (t === '' || t === '#') return { kind: 'degenerate' };
    if (t.startsWith('#')) return { kind: 'skip' }; // in-page fragment — out of scope
    if (/^(mailto:|tel:|javascript:|data:|sms:|ftp:)/i.test(t)) return { kind: 'skip' };

    // Absolute URL (scheme://...) or protocol-relative (//host/...) — external unless same-origin.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || t.startsWith('//')) {
        const sameOrigin = baseUrl ? originOf(baseUrl) : undefined;
        if (sameOrigin) {
            try {
                const u = new URL(t.startsWith('//') ? 'https:' + t : t);
                if (u.origin === sameOrigin)
                    return { kind: 'check', targetPath: normalizePath(u.pathname) };
            } catch {
                /* fall through to skip */
            }
        }
        return { kind: 'skip' };
    }

    if (t.startsWith('/')) return { kind: 'check', targetPath: normalizePath(t) };

    // Relative href (`./x`, `../x`, `x`) — needs the page URL to resolve; v1 blind spot.
    return { kind: 'skip' };
}

export interface CheckInternalLinksOptions {
    parsedFiles: Array<{
        relativePath: string;
        parsed: {
            body: HTMLElement;
            validationOverrides?: Record<string, Record<string, boolean | string[]>>;
        };
    }>;
    oracle: RouteOracle;
    assetUrls: Set<string>;
    baseUrl?: string;
    /** Project root used to resolve each page file to its own route URL (for self-link detection). */
    projectRoot?: string;
}

/** Check every `<a href>` across the parsed pages; returns one finding per broken/degenerate/self link. */
export function checkInternalLinks(options: CheckInternalLinksOptions): LinkFinding[] {
    const { parsedFiles, oracle, assetUrls, baseUrl, projectRoot } = options;
    const findings: LinkFinding[] = [];

    for (const { relativePath, parsed } of parsedFiles) {
        if (parsed.validationOverrides?.['jay-stack']?.[SUPPRESS_KEY] === true) continue;

        // The page's own URL — only pages (not reused components) have one; used to flag self-links.
        const ownUrl = oracle.selfUrlByPath.get(path.resolve(projectRoot ?? '.', relativePath));

        for (const anchor of parsed.body.querySelectorAll('a[href]')) {
            const raw = anchor.getAttribute('href');
            if (raw === undefined || raw === null) continue;

            const verdict = classifyHref(raw, baseUrl);
            if (verdict.kind === 'skip') continue;

            if (verdict.kind === 'degenerate') {
                findings.push({
                    file: relativePath,
                    message: `Anchor has a placeholder href "${raw}" — it links nowhere and ships as a dead link.`,
                    suggestion: `Point the link at a real page, use <button> for a JS-driven action, or ${SUPPRESS_HINT}.`,
                });
                continue;
            }

            const target = verdict.targetPath;

            if (ownUrl !== undefined && target === ownUrl) {
                findings.push({
                    file: relativePath,
                    message: `Link points to the page's own route "${target}" — a self-link goes nowhere.`,
                    suggestion: `Remove the link, use "#" within-page navigation, or point it at a different page.`,
                });
                continue;
            }

            if (oracle.staticUrls.has(target)) continue;
            if (assetUrls.has(target)) continue;
            if (oracle.dynamicMatchers.some((re) => re.test(target))) continue; // deferred to Check 2

            findings.push({
                file: relativePath,
                message: `Broken internal link "${raw}" — no page or public asset produces the URL "${target}".`,
                suggestion: `Create a placeholder page/route for "${target}", or remove the link. Otherwise ${SUPPRESS_HINT}.`,
            });
        }
    }

    return findings;
}
