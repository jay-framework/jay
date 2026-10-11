import { describe, it, expect, vi } from 'vitest';
import {
    tagIdentityKey,
    mergeHeadTags,
    serializeHeadTags,
    serializeScripts,
    escapeJsonLd,
    isJsonLdScript,
    type JayHtmlScript,
} from '../lib/head-tags';
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

    it('does not warn when template tags override plugin tags', async () => {
        const logger = await import('@jay-framework/logger');
        const warnSpy = vi.spyOn(logger.getLogger(), 'warn');

        const pluginTags: HeadTag[] = [{ tag: 'title', children: 'Plugin Title' }];
        const templateTags: HeadTag[] = [{ tag: 'title', children: 'Template Title' }];
        const result = mergeHeadTags([pluginTags], templateTags);

        expect(warnSpy).not.toHaveBeenCalled();
        expect(result).toEqual([{ tag: 'title', children: 'Template Title' }]);
        warnSpy.mockRestore();
    });

    it('still warns on plugin-vs-plugin collision even when template tags are present', async () => {
        const logger = await import('@jay-framework/logger');
        const warnSpy = vi.spyOn(logger.getLogger(), 'warn');

        const pluginA: HeadTag[] = [{ tag: 'title', children: 'A' }];
        const pluginB: HeadTag[] = [{ tag: 'title', children: 'B' }];
        const templateTags: HeadTag[] = [
            { tag: 'meta', attrs: { name: 'description', content: 'd' } },
        ];
        mergeHeadTags([pluginA, pluginB], templateTags);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Collision on "title"'));
        warnSpy.mockRestore();
    });

    it('template-only keyed tags are appended after plugin tags', () => {
        const pluginTags: HeadTag[] = [{ tag: 'title', children: 'Plugin' }];
        const templateTags: HeadTag[] = [
            { tag: 'meta', attrs: { name: 'description', content: 'desc' } },
        ];
        const result = mergeHeadTags([pluginTags], templateTags);
        expect(result).toEqual([
            { tag: 'title', children: 'Plugin' },
            { tag: 'meta', attrs: { name: 'description', content: 'desc' } },
        ]);
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

describe('JSON-LD serialization (DL#213)', () => {
    it('isJsonLdScript detects application/ld+json scripts', () => {
        expect(isJsonLdScript({ tag: 'script', attrs: { type: 'application/ld+json' } })).toBe(
            true,
        );
        expect(isJsonLdScript({ tag: 'script', attrs: { type: 'text/javascript' } })).toBe(false);
        expect(isJsonLdScript({ tag: 'script' })).toBe(false);
        expect(isJsonLdScript({ tag: 'title', children: 'x' })).toBe(false);
    });

    it('escapeJsonLd escapes < > & as unicode escapes, not HTML entities', () => {
        expect(escapeJsonLd('a & b < c > d')).toBe('a \\u0026 b \\u003c c \\u003e d');
    });

    it('does NOT HTML-escape JSON-LD script bodies (the DL#213 bug)', () => {
        const json = '{"@context":"https://schema.org","url":"https://x.com/?a=1&b=2"}';
        const result = serializeHeadTags([
            { tag: 'script', attrs: { type: 'application/ld+json' }, children: json },
        ]);
        expect(result).toBe(
            '    <script type="application/ld+json">{"@context":"https://schema.org","url":"https://x.com/?a=1\\u0026b=2"}</script>',
        );
    });

    it('emitted JSON-LD body round-trips through JSON.parse with the & preserved', () => {
        const data = { '@context': 'https://schema.org', url: 'https://x.com/?a=1&b=2' };
        const result = serializeHeadTags([
            {
                tag: 'script',
                attrs: { type: 'application/ld+json' },
                children: JSON.stringify(data),
            },
        ]);
        const body = result.slice(result.indexOf('>') + 1, result.lastIndexOf('</script>'));
        expect(JSON.parse(body)).toEqual(data);
    });

    it('is breakout-safe: a </script> in data cannot close the tag', () => {
        const data = { evil: '</script><script>alert(1)</script>' };
        const result = serializeHeadTags([
            {
                tag: 'script',
                attrs: { type: 'application/ld+json' },
                children: JSON.stringify(data),
            },
        ]);
        // No literal </script> except the real closing tag at the very end.
        const closings = result.split('</script>').length - 1;
        expect(closings).toBe(1);
        expect(result.endsWith('</script>')).toBe(true);
    });
});

describe('serializeScripts (DL#149 passthrough)', () => {
    const scripts: JayHtmlScript[] = [
        {
            src: 'https://cdn.example.com/analytics.js',
            attributes: { async: '', defer: '' },
            position: 'head',
        },
        {
            inline: 'window.__brand = "A & B <ok>";',
            attributes: {},
            position: 'body',
        },
    ];

    it('returns empty string for undefined scripts', () => {
        expect(serializeScripts(undefined, 'head')).toBe('');
    });

    it('returns empty string when no script matches the position', () => {
        expect(serializeScripts([scripts[0]], 'body')).toBe('');
    });

    it('renders a src script with boolean attributes preserved', () => {
        expect(serializeScripts(scripts, 'head')).toBe(
            '    <script src="https://cdn.example.com/analytics.js" async defer></script>',
        );
    });

    it('renders an inline body script un-escaped', () => {
        expect(serializeScripts(scripts, 'body')).toBe(
            '    <script>window.__brand = "A & B <ok>";</script>',
        );
    });

    it('renders key="value" attributes for non-boolean attrs', () => {
        const result = serializeScripts(
            [{ src: '/x.js', attributes: { type: 'module', nonce: 'abc' }, position: 'head' }],
            'head',
        );
        expect(result).toBe('    <script src="/x.js" type="module" nonce="abc"></script>');
    });

    it('emits an inline application/ld+json body breakout-safe (DL#213)', () => {
        const result = serializeScripts(
            [
                {
                    inline: '{"@type":"Organization","name":"A & B","x":"</script><b>"}',
                    attributes: { type: 'application/ld+json' },
                    position: 'head',
                },
            ],
            'head',
        );
        expect(result).toBe(
            '    <script type="application/ld+json">{"@type":"Organization","name":"A \\u0026 B","x":"\\u003c/script\\u003e\\u003cb\\u003e"}</script>',
        );
        // The emitted body (between the script tags) is still valid, equivalent JSON.
        const body = result.slice(result.indexOf('>') + 1, result.lastIndexOf('</script>'));
        expect(JSON.parse(body)).toEqual({
            '@type': 'Organization',
            name: 'A & B',
            x: '</script><b>',
        });
    });
});
