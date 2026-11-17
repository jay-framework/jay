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
    /**
     * DL#210 v2 — severity tier. `error` fails the project (routed to `errors`); `warning` is advisory
     * (routed to `warnings`, never blocks `--strict`). Broken/degenerate/missing-fragment are errors;
     * self-link and TODO links are warnings.
     */
    severity: 'error' | 'warning';
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

/** DL#210 v2 — per-anchor opt-out for the self-link warning (`<a href="/here" jay-allow-self-link>`). */
const SELF_LINK_ALLOW_ATTR = 'jay-allow-self-link';

/** DL#210 v2 — a `todo:` href marks an intentional, not-yet-wired link. The text after `todo:` is a free-form
 * note (a reminder, or the intended target like `todo:/pricing`). It always warns and is never suppressible. */
const TODO_SCHEME = /^todo:/i;

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
        // DL#218 — error pages are not URLs; internal-link checking only considers navigable routes.
        ({ routes } = await scanRoutes(pagesBase, {
            jayHtmlFilename: 'page.jay-html',
            compFilename: 'page.ts',
        }));
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

/**
 * The element's opening tag without its children — e.g. `<a href="/" class="logo">` — so a finding
 * identifies *which* anchor is at fault (a page can carry several links to the same URL). Whitespace in
 * the raw attributes is collapsed to keep the tag on one line, and compiler-injected `jay-*` attributes
 * (e.g. `jay-coordinate-base`) are dropped so the tag reflects the author's source, not internals.
 */
function openingTag(el: HTMLElement): string {
    const attrs = el.rawAttrs
        ?.replace(/\s+jay-[\w-]+(="[^"]*"|='[^']*')?/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return attrs ? `<${el.rawTagName} ${attrs}>` : `<${el.rawTagName}>`;
}

function originOf(baseUrl: string): string | undefined {
    try {
        return new URL(baseUrl).origin;
    } catch {
        return undefined;
    }
}

type HrefVerdict =
    | { kind: 'skip' }
    | { kind: 'degenerate' }
    | { kind: 'todo'; note: string }
    | { kind: 'localFragment'; fragment: string }
    | { kind: 'check'; targetPath: string; fragment?: string };

/** The `#fragment` part of an href (without the `#`), or '' if none. Query is dropped first. */
function fragmentOf(raw: string): string {
    const hash = raw.indexOf('#');
    return hash === -1 ? '' : raw.slice(hash + 1);
}

/**
 * Classify a raw href into: skip (not an internal route link), degenerate (`#`/empty placeholder), todo (a
 * `todo:` placeholder marker), localFragment (`#name` on the current page), or check (a root-relative/same-origin
 * path to resolve against the oracle, carrying its optional `#fragment`).
 */
export function classifyHref(raw: string, baseUrl?: string): HrefVerdict {
    if (raw.includes('{')) return { kind: 'skip' }; // dynamic binding — not statically resolvable
    const t = raw.trim();
    if (t === '' || t === '#') return { kind: 'degenerate' };
    if (TODO_SCHEME.test(t)) return { kind: 'todo', note: t.replace(TODO_SCHEME, '').trim() };
    if (t.startsWith('#')) return { kind: 'localFragment', fragment: t.slice(1) }; // same-page anchor
    if (/^(mailto:|tel:|javascript:|data:|sms:|ftp:)/i.test(t)) return { kind: 'skip' };

    // Absolute URL (scheme://...) or protocol-relative (//host/...) — external unless same-origin.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || t.startsWith('//')) {
        const sameOrigin = baseUrl ? originOf(baseUrl) : undefined;
        if (sameOrigin) {
            try {
                const u = new URL(t.startsWith('//') ? 'https:' + t : t);
                if (u.origin === sameOrigin) {
                    const frag = u.hash.slice(1);
                    return frag
                        ? { kind: 'check', targetPath: normalizePath(u.pathname), fragment: frag }
                        : { kind: 'check', targetPath: normalizePath(u.pathname) };
                }
            } catch {
                /* fall through to skip */
            }
        }
        return { kind: 'skip' };
    }

    if (t.startsWith('/')) {
        const frag = fragmentOf(t);
        return frag
            ? { kind: 'check', targetPath: normalizePath(t), fragment: frag }
            : { kind: 'check', targetPath: normalizePath(t) };
    }

    // Relative href (`./x`, `../x`, `x`) — needs the page URL to resolve; v1 blind spot.
    return { kind: 'skip' };
}

/** A fragment that needs a matching anchor. `top` and the empty fragment are browser no-ops — never flagged. */
function fragmentNeedsAnchor(fragment: string): boolean {
    const f = fragment.trim();
    return f !== '' && f.toLowerCase() !== 'top';
}

/** Collect every anchor target id on a page body: element `id`s plus legacy `<a name="…">`. */
function collectAnchorIds(body: HTMLElement): Set<string> {
    const ids = new Set<string>();
    for (const el of body.querySelectorAll('[id]')) {
        const id = el.getAttribute('id');
        if (id) ids.add(id);
    }
    for (const a of body.querySelectorAll('a[name]')) {
        const name = a.getAttribute('name');
        if (name) ids.add(name);
    }
    return ids;
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

/**
 * Check every `<a href>` across the parsed pages; returns one finding per broken/degenerate/self/todo/fragment
 * link. Severity (DL#210 v2): broken/degenerate/missing-fragment → `error`; self-link/TODO → `warning`.
 */
export function checkInternalLinks(options: CheckInternalLinksOptions): LinkFinding[] {
    const { parsedFiles, oracle, assetUrls, baseUrl, projectRoot } = options;
    const findings: LinkFinding[] = [];

    // DL#210 v2 — id index per concrete page URL, for cross-page fragment (`/about#team`) resolution. Only pages
    // with a known route URL are indexed; a target we did not parse is left unverifiable (fragment check skipped).
    const idsByUrl = new Map<string, Set<string>>();
    for (const { relativePath, parsed } of parsedFiles) {
        const url = oracle.selfUrlByPath.get(path.resolve(projectRoot ?? '.', relativePath));
        if (url !== undefined) idsByUrl.set(url, collectAnchorIds(parsed.body));
    }

    for (const { relativePath, parsed } of parsedFiles) {
        // Per-page suppression covers only the broken/degenerate ERRORS. TODO + fragment checks always run;
        // self-links are suppressed per-anchor instead (jay-allow-self-link).
        const allowBroken = parsed.validationOverrides?.['jay-stack']?.[SUPPRESS_KEY] === true;

        // The page's own URL — only pages (not reused components) have one; used to flag self-links and to
        // resolve this page's own `#fragment` links.
        const ownUrl = oracle.selfUrlByPath.get(path.resolve(projectRoot ?? '.', relativePath));
        const ownIds = ownUrl !== undefined ? idsByUrl.get(ownUrl) : undefined;

        for (const anchor of parsed.body.querySelectorAll('a[href]')) {
            const raw = anchor.getAttribute('href');
            if (raw === undefined || raw === null) continue;

            const verdict = classifyHref(raw, baseUrl);
            if (verdict.kind === 'skip') continue;

            const tag = openingTag(anchor);

            // TODO marker — always a warning, never suppressible (a deliberate, recurring reminder).
            if (verdict.kind === 'todo') {
                const note = verdict.note
                    ? ` — intended target "${verdict.note}" is not wired up yet`
                    : '';
                findings.push({
                    file: relativePath,
                    severity: 'warning',
                    message: `TODO link ${tag}${note}. This reminder cannot be suppressed — resolve it before release.`,
                    suggestion: `Replace the "todo:" href with the real destination once the page/route exists.`,
                });
                continue;
            }

            // Same-page fragment (`#name`) — resolve against this page's ids (skip if the page has no route URL,
            // e.g. a reused component, where the fragment's page context is unknown).
            if (verdict.kind === 'localFragment') {
                if (!fragmentNeedsAnchor(verdict.fragment)) continue; // `#top` / empty — browser no-op
                if (ownIds && !ownIds.has(verdict.fragment)) {
                    findings.push({
                        file: relativePath,
                        severity: 'error',
                        message: `Broken fragment link ${tag} — this page has no element with id "${verdict.fragment}".`,
                        suggestion: `Add id="${verdict.fragment}" to the target element, or fix the fragment.`,
                    });
                }
                continue;
            }

            if (verdict.kind === 'degenerate') {
                if (allowBroken) continue;
                findings.push({
                    file: relativePath,
                    severity: 'error',
                    message: `Anchor ${tag} has a placeholder href "${raw}" — it links nowhere and ships as a dead link.`,
                    suggestion: `Point the link at a real page, use <button> for a JS-driven action, or ${SUPPRESS_HINT}.`,
                });
                continue;
            }

            // kind === 'check' — a root-relative/same-origin path, with an optional `#fragment`.
            const target = verdict.targetPath;
            const fragment = verdict.fragment ?? '';

            // Self-link: a bare link to this page's own route (no meaningful fragment). Warning, suppressed
            // per-anchor via jay-allow-self-link ("in some cases it makes sense to use it").
            if (ownUrl !== undefined && target === ownUrl && !fragmentNeedsAnchor(fragment)) {
                if (anchor.hasAttribute(SELF_LINK_ALLOW_ATTR)) continue;
                findings.push({
                    file: relativePath,
                    severity: 'warning',
                    message: `Anchor ${tag} points to the page's own route "${target}" — a self-link goes nowhere.`,
                    suggestion: `Remove the link, use an in-page "#" fragment, or add ${SELF_LINK_ALLOW_ATTR} to the anchor if intentional.`,
                });
                continue;
            }

            const resolves =
                oracle.staticUrls.has(target) ||
                assetUrls.has(target) ||
                oracle.dynamicMatchers.some((re) => re.test(target)); // dynamic deferred to Check 2

            if (!resolves) {
                if (allowBroken) continue;
                findings.push({
                    file: relativePath,
                    severity: 'error',
                    message: `Broken internal link in anchor ${tag} — no page or public asset produces the URL "${target}".`,
                    suggestion: `Create a placeholder page/route for "${target}", or remove the link. Otherwise ${SUPPRESS_HINT}.`,
                });
                continue;
            }

            // Path resolves — cross-page fragment check, only when the target page's ids are known (static page
            // we parsed). Dynamic routes, assets, and unparsed targets are left unverifiable (skipped).
            if (fragmentNeedsAnchor(fragment)) {
                const targetIds = target === ownUrl ? ownIds : idsByUrl.get(target);
                if (targetIds && !targetIds.has(fragment)) {
                    findings.push({
                        file: relativePath,
                        severity: 'error',
                        message: `Broken fragment link ${tag} — page "${target}" has no element with id "${fragment}".`,
                        suggestion: `Add id="${fragment}" to the target element on "${target}", or fix the fragment.`,
                    });
                }
            }
        }
    }

    return findings;
}
