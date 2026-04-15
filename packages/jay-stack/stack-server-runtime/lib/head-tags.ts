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
 * Warns on collision via logger.
 */
export function mergeHeadTags(sources: HeadTag[][]): HeadTag[] {
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
