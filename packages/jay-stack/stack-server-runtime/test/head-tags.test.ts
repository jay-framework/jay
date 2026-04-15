import { describe, it, expect, vi } from 'vitest';
import { tagIdentityKey, mergeHeadTags, serializeHeadTags } from '../lib/head-tags';
import type { HeadTag } from '@jay-framework/fullstack-component';

describe('tagIdentityKey', () => {
    it('title is a singleton', () => {
        expect(tagIdentityKey({ tag: 'title', children: 'My Page' })).toBe('title');
    });

    it('meta with name is keyed by name', () => {
        expect(tagIdentityKey({ tag: 'meta', attrs: { name: 'description', content: 'x' } })).toBe(
            'meta:name:description',
        );
    });

    it('meta with property is keyed by property', () => {
        expect(tagIdentityKey({ tag: 'meta', attrs: { property: 'og:title', content: 'x' } })).toBe(
            'meta:property:og:title',
        );
    });

    it('meta with charset is a singleton', () => {
        expect(tagIdentityKey({ tag: 'meta', attrs: { charset: 'UTF-8' } })).toBe('meta:charset');
    });

    it('link rel=canonical is a singleton', () => {
        expect(tagIdentityKey({ tag: 'link', attrs: { rel: 'canonical', href: '/page' } })).toBe(
            'link:canonical',
        );
    });

    it('link with other rel returns undefined (no dedup)', () => {
        expect(
            tagIdentityKey({ tag: 'link', attrs: { rel: 'stylesheet', href: '/style.css' } }),
        ).toBeUndefined();
    });

    it('meta without name or property returns undefined', () => {
        expect(tagIdentityKey({ tag: 'meta', attrs: { 'http-equiv': 'refresh' } })).toBeUndefined();
    });

    it('unknown tags return undefined', () => {
        expect(tagIdentityKey({ tag: 'script', children: '{}' })).toBeUndefined();
    });

    it('tag name is case-insensitive', () => {
        expect(tagIdentityKey({ tag: 'TITLE', children: 'Test' })).toBe('title');
        expect(tagIdentityKey({ tag: 'Meta', attrs: { name: 'x' } })).toBe('meta:name:x');
    });
});

describe('mergeHeadTags', () => {
    it('returns all tags from a single source', () => {
        const tags: HeadTag[] = [
            { tag: 'title', children: 'Page' },
            { tag: 'meta', attrs: { name: 'description', content: 'desc' } },
        ];
        const result = mergeHeadTags([tags]);
        expect(result).toEqual(tags);
    });

    it('last-write-wins for same key across sources', () => {
        const source1: HeadTag[] = [{ tag: 'title', children: 'First' }];
        const source2: HeadTag[] = [{ tag: 'title', children: 'Second' }];
        const result = mergeHeadTags([source1, source2]);
        expect(result).toEqual([{ tag: 'title', children: 'Second' }]);
    });

    it('warns on collision between different sources', async () => {
        const logger = await import('@jay-framework/logger');
        const warnSpy = vi.spyOn(logger.getLogger(), 'warn');

        const source1: HeadTag[] = [{ tag: 'title', children: 'First' }];
        const source2: HeadTag[] = [{ tag: 'title', children: 'Second' }];
        mergeHeadTags([source1, source2]);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Collision on "title"'));
        warnSpy.mockRestore();
    });

    it('does not warn when same source overwrites itself', async () => {
        const logger = await import('@jay-framework/logger');
        const warnSpy = vi.spyOn(logger.getLogger(), 'warn');

        const source: HeadTag[] = [
            { tag: 'title', children: 'First' },
            { tag: 'title', children: 'Second' },
        ];
        mergeHeadTags([source]);

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('non-keyed tags are always included', () => {
        const source1: HeadTag[] = [{ tag: 'link', attrs: { rel: 'stylesheet', href: '/a.css' } }];
        const source2: HeadTag[] = [{ tag: 'link', attrs: { rel: 'stylesheet', href: '/b.css' } }];
        const result = mergeHeadTags([source1, source2]);
        expect(result.length).toBe(2);
    });

    it('keyed tags come before non-keyed', () => {
        const source: HeadTag[] = [
            { tag: 'link', attrs: { rel: 'stylesheet', href: '/a.css' } },
            { tag: 'title', children: 'Page' },
        ];
        const result = mergeHeadTags([source]);
        expect(result[0].tag).toBe('title');
        expect(result[1].tag).toBe('link');
    });

    it('empty sources return empty array', () => {
        expect(mergeHeadTags([])).toEqual([]);
        expect(mergeHeadTags([[], []])).toEqual([]);
    });
});

describe('serializeHeadTags', () => {
    it('renders title with children', () => {
        const result = serializeHeadTags([{ tag: 'title', children: 'My Page' }]);
        expect(result).toBe('    <title>My Page</title>');
    });

    it('renders void elements as self-closing', () => {
        const result = serializeHeadTags([
            { tag: 'meta', attrs: { name: 'description', content: 'desc' } },
        ]);
        expect(result).toBe('    <meta name="description" content="desc" />');
    });

    it('renders link as self-closing', () => {
        const result = serializeHeadTags([
            { tag: 'link', attrs: { rel: 'canonical', href: '/page' } },
        ]);
        expect(result).toBe('    <link rel="canonical" href="/page" />');
    });

    it('escapes HTML in children', () => {
        const result = serializeHeadTags([{ tag: 'title', children: 'A & B <script>' }]);
        expect(result).toBe('    <title>A &amp; B &lt;script&gt;</title>');
    });

    it('escapes HTML in attribute values', () => {
        const result = serializeHeadTags([
            { tag: 'meta', attrs: { name: 'desc', content: 'a "quoted" & <value>' } },
        ]);
        expect(result).toBe(
            '    <meta name="desc" content="a &quot;quoted&quot; &amp; &lt;value&gt;" />',
        );
    });

    it('renders multiple tags separated by newlines', () => {
        const result = serializeHeadTags([
            { tag: 'title', children: 'Page' },
            { tag: 'meta', attrs: { name: 'description', content: 'desc' } },
        ]);
        const lines = result.split('\n');
        expect(lines.length).toBe(2);
        expect(lines[0]).toBe('    <title>Page</title>');
        expect(lines[1]).toBe('    <meta name="description" content="desc" />');
    });

    it('renders non-void element without children as empty', () => {
        const result = serializeHeadTags([{ tag: 'style' }]);
        expect(result).toBe('    <style></style>');
    });
});
