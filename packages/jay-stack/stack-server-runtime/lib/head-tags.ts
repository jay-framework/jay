/**
 * Head tag utilities for SSR head injection (Design Log #127).
 *
 * Components declare HeadTag[] via phaseOutput(). The SSR pipeline collects
 * tags from all sources, deduplicates with last-write-wins + collision warning,
 * and serializes to HTML for injection into <head>.
 */

import type { HeadTag } from '@jay-framework/fullstack-component';
import { getLogger } from '@jay-framework/logger';

/**
 * Compute a unique identity key for deduplication.
 * Returns undefined for tags that should always be included (no dedup).
 */
export function tagIdentityKey(tag: HeadTag): string | undefined {
    const t = tag.tag.toLowerCase();
    if (t === 'title') return 'title';
    if (t === 'meta') {
        if (tag.attrs?.name) return `meta:name:${tag.attrs.name}`;
        if (tag.attrs?.property) return `meta:property:${tag.attrs.property}`;
        if (tag.attrs?.charset !== undefined) return 'meta:charset';
        return undefined;
    }
    if (t === 'link') {
        if (tag.attrs?.rel === 'canonical') return 'link:canonical';
        return undefined;
    }
    return undefined;
}

/**
 * Merge head tags from multiple sources with last-write-wins.
 *
 * `sources` are plugin/component-provided tags; a collision on the same key
 * between two *different* plugin sources is unexpected and logs a warning.
 *
 * `templateTags` are the page template's `<head>` tags, which have documented
 * higher precedence (DL#148) and always win silently. A template tag overriding
 * a plugin-provided tag is intentional, not a collision, so it never warns —
 * this is the common case for markdown pages that both declare `<title>` in the
 * template and inject one from frontmatter.
 */
export function mergeHeadTags(sources: HeadTag[][], templateTags?: HeadTag[]): HeadTag[] {
    const byKey = new Map<string, { tag: HeadTag; sourceIndex: number }>();
    const result: HeadTag[] = [];

    for (let si = 0; si < sources.length; si++) {
        for (const tag of sources[si]) {
            const key = tagIdentityKey(tag);
            if (key) {
                const existing = byKey.get(key);
                if (existing && existing.sourceIndex !== si) {
                    getLogger().warn(
                        `[head-tags] Collision on "${key}" — overwriting with tag from source ${si}`,
                    );
                }
                byKey.set(key, { tag, sourceIndex: si });
            } else {
                result.push(tag);
            }
        }
    }

    // Template <head> tags win silently over plugin-provided tags (DL#148).
    if (templateTags) {
        for (const tag of templateTags) {
            const key = tagIdentityKey(tag);
            if (key) {
                byKey.set(key, { tag, sourceIndex: -1 });
            } else {
                result.push(tag);
            }
        }
    }

    // Keyed tags first (in insertion order), then non-keyed
    return [...[...byKey.values()].map((v) => v.tag), ...result];
}

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tags that are self-closing (void elements). */
const VOID_ELEMENTS = new Set(['meta', 'link', 'base', 'br', 'hr', 'img', 'input']);

// --- headMetaToHeadTags: converts parsed head metadata into HeadTag[] ---

interface TemplatePart {
    kind: 'static' | 'binding';
    value: string;
}

export interface JayHtmlHeadMeta {
    title?: TemplatePart[];
    meta: Array<{ name?: string; property?: string; content: TemplatePart[] }>;
    links: Array<{ rel: string; href: TemplatePart[]; [key: string]: any }>;
}

function getByPath(obj: any, dotPath: string): unknown {
    const segments = dotPath.split('.');
    let current = obj;
    for (const seg of segments) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[seg];
    }
    return current;
}

function resolveParts(parts: TemplatePart[], viewState?: object): string {
    return parts
        .map((p) => {
            if (p.kind === 'static') return p.value;
            if (!viewState) return `{${p.value}}`;
            const resolved = getByPath(viewState, p.value);
            return resolved !== undefined && resolved !== null ? String(resolved) : `{${p.value}}`;
        })
        .join('');
}

export function headMetaToHeadTags(
    headMeta: JayHtmlHeadMeta | undefined,
    viewState?: object,
): HeadTag[] {
    if (!headMeta) return [];
    const tags: HeadTag[] = [];
    if (headMeta.title) {
        tags.push({ tag: 'title', children: resolveParts(headMeta.title, viewState) });
    }
    for (const m of headMeta.meta) {
        const attrs: Record<string, string> = {};
        if (m.name) attrs.name = m.name;
        if (m.property) attrs.property = m.property;
        attrs.content = resolveParts(m.content, viewState);
        tags.push({ tag: 'meta', attrs });
    }
    for (const l of headMeta.links) {
        if (l.rel === 'stylesheet' || l.rel === 'import') continue;
        const attrs: Record<string, string> = { rel: l.rel };
        attrs.href = resolveParts(l.href, viewState);
        for (const [k, v] of Object.entries(l)) {
            if (k !== 'rel' && k !== 'href' && typeof v === 'string') attrs[k] = v;
        }
        tags.push({ tag: 'link', attrs });
    }
    return tags;
}

/**
 * A passthrough `<script jay-script="allow">` collected from a jay-html template (DL#149 Phase 2).
 * Structurally mirrors the compiler's `JayHtmlScript` so values flow through unchanged.
 */
export interface JayHtmlScript {
    src?: string;
    inline?: string;
    attributes: Record<string, string>;
    position: 'head' | 'body';
}

/**
 * Serialize passthrough scripts for one position (`head` or `body`) into an HTML string.
 * Inline bodies are emitted un-escaped (the author opted in via `jay-script="allow"`).
 * Shared by the dev SSR path and the production server so both render identically (DL#149).
 */
export function serializeScripts(
    scripts: JayHtmlScript[] | undefined,
    position: 'head' | 'body',
): string {
    if (!scripts) return '';
    const filtered = scripts.filter((s) => s.position === position);
    if (filtered.length === 0) return '';
    return filtered
        .map((s) => {
            const attrs = Object.entries(s.attributes)
                .map(([k, v]) => (v === '' ? k : `${k}="${v}"`))
                .join(' ');
            const attrStr = attrs ? ' ' + attrs : '';
            if (s.src) {
                return `    <script src="${s.src}"${attrStr}></script>`;
            }
            return `    <script${attrStr}>${s.inline}</script>`;
        })
        .join('\n');
}

/**
 * Serialize an array of HeadTag objects into an HTML string.
 */
export function serializeHeadTags(tags: HeadTag[]): string {
    return tags
        .map((tag) => {
            const t = tag.tag.toLowerCase();
            const attrs = tag.attrs
                ? Object.entries(tag.attrs)
                      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
                      .join('')
                : '';
            if (VOID_ELEMENTS.has(t)) {
                return `    <${t}${attrs} />`;
            }
            const children = tag.children ? escapeHtml(tag.children) : '';
            return `    <${t}${attrs}>${children}</${t}>`;
        })
        .join('\n');
}
