import { parse } from 'node-html-parser';
import { describe, it, expect, afterEach } from 'vitest';
import { validate } from '../../lib/validators/seo-validator.js';
import type {
    JayHtmlValidationContext,
    JayHtmlHeadMeta,
    TemplatePart,
} from '@jay-framework/compiler-shared';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function s(value: string): TemplatePart[] {
    return [{ kind: 'static', value }];
}

const completeHead: JayHtmlHeadMeta = {
    title: s('Test Page'),
    meta: [{ name: 'description', content: s('Test description') }],
    links: [{ rel: 'canonical', href: s('https://example.com/test') }],
};

function makeContext(
    html: string,
    options: { wrapInMain?: boolean; head?: JayHtmlHeadMeta } = {},
): JayHtmlValidationContext {
    const { wrapInMain = true, head = completeHead } = options;
    const wrapped = wrapInMain ? `<main>${html}</main>` : html;
    return {
        body: parse(wrapped),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
        head,
    };
}

describe('seo-validator', () => {
    describe('img alt attribute', () => {
        it('flags img without alt', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" width="100" height="100" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<img>',
                    attribute: 'alt',
                }),
            ]);
        });

        it('passes img with alt', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="A photo" width="100" height="100" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with empty alt (decorative)', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="bg.jpg" alt="" width="100" height="100" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('anchor text', () => {
        it('flags empty anchor without aria-label', async () => {
            const ctx = makeContext('<div><h1>Title</h1><a href="/about"></a></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<a>',
                }),
            ]);
        });

        it('passes anchor with text', async () => {
            const ctx = makeContext('<div><h1>Title</h1><a href="/about">About us</a></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes empty anchor with aria-label', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><a href="/home" aria-label="Go home"></a></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes anchor containing img', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><a href="/"><img src="logo.png" alt="Home" width="50" height="50" loading="lazy" fetchpriority="high" /></a></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('heading hierarchy', () => {
        it('flags missing h1', async () => {
            const ctx = makeContext('<div><h2>Subtitle</h2><p>Content</p></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<h1>',
                    message: expect.stringContaining('no <h1>'),
                }),
            ]);
        });

        it('flags multiple h1 elements', async () => {
            const ctx = makeContext('<div><h1>First</h1><h1>Second</h1></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('2 <h1>'),
                }),
            ]);
        });

        it('flags skipped heading levels', async () => {
            const ctx = makeContext('<div><h1>Title</h1><h3>Skipped h2</h3></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('h1> followed by <h3'),
                }),
            ]);
        });

        it('passes proper heading hierarchy', async () => {
            const ctx = makeContext('<div><h1>Title</h1><h2>Section</h2><h3>Sub</h3></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('image dimensions (CLS)', () => {
        it('flags img without width/height', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<img>',
                    attribute: 'width',
                    message: expect.stringContaining('CLS'),
                }),
            ]);
        });

        it('passes img with width and height', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="800" height="600" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with inline style dimensions', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" style="width: 100%; height: auto;" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with srcset (responsive)', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" srcset="photo-400.jpg 400w, photo-800.jpg 800w" sizes="(max-width: 600px) 400px, 800px" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('image lazy loading', () => {
        it('flags img without loading attribute', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="100" height="100" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<img>',
                    attribute: 'loading',
                }),
            ]);
        });

        it('passes img with loading="lazy"', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="100" height="100" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with loading="eager"', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="hero.jpg" alt="hero" width="1200" height="600" loading="eager" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('fetchpriority', () => {
        it('flags page with images but no fetchpriority="high"', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="100" height="100" loading="lazy" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<img>',
                    attribute: 'fetchpriority',
                    message: expect.stringContaining('fetchpriority'),
                }),
            ]);
        });

        it('passes when an image has fetchpriority="high"', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="100" height="100" loading="lazy" fetchpriority="high" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('does not flag pages with no images', async () => {
            const ctx = makeContext('<div><h1>Title</h1><p>No images here</p></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('main landmark', () => {
        it('flags page without main element', async () => {
            const ctx = makeContext('<div><h1>Title</h1><p>Content</p></div>', {
                wrapInMain: false,
            });
            const findings = await validate(ctx);
            expect(findings).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        severity: 'warning',
                        element: '<main>',
                        message: expect.stringContaining('no <main>'),
                    }),
                ]),
            );
        });

        it('passes page with main element', async () => {
            const ctx = makeContext('<div><h1>Title</h1><p>Content</p></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('head metadata', () => {
        it('flags missing title', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: undefined,
                    meta: [{ name: 'description', content: s('Desc') }],
                    links: [],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<title>',
                }),
            ]);
        });

        it('suppresses missing title when component provides it', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: undefined,
                    meta: [{ name: 'description', content: s('Desc') }],
                    links: [],
                },
            });
            ctx.headlessImports = [
                { contractName: 'product-page', providedHeadTags: ['title', 'meta:description'] },
            ];
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('flags missing meta description', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: { title: s('Page'), meta: [], links: [] },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<meta>',
                    message: expect.stringContaining('description'),
                }),
            ]);
        });

        it('flags relative canonical URL', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: s('Page'),
                    meta: [{ name: 'description', content: s('Desc') }],
                    links: [{ rel: 'canonical', href: s('/products') }],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('absolute'),
                }),
            ]);
        });

        it('passes absolute canonical URL', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: s('Page'),
                    meta: [{ name: 'description', content: s('Desc') }],
                    links: [{ rel: 'canonical', href: s('https://example.com/products') }],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('skips canonical check when href has binding', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: s('Page'),
                    meta: [{ name: 'description', content: s('Desc') }],
                    links: [
                        {
                            rel: 'canonical',
                            href: [
                                { kind: 'binding', value: 'siteUrl' },
                                { kind: 'static', value: '/products' },
                            ],
                        },
                    ],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('does not warn when canonical is absent', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: s('Page'),
                    meta: [{ name: 'description', content: s('Desc') }],
                    links: [],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('flags noindex in robots meta', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: s('Page'),
                    meta: [
                        { name: 'description', content: s('Desc') },
                        { name: 'robots', content: s('noindex, nofollow') },
                    ],
                    links: [],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('noindex'),
                }),
            ]);
        });

        it('passes with complete head metadata', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('clean page', () => {
        it('returns no findings for well-structured page', async () => {
            const ctx = makeContext(
                `<div>
                    <h1>Product Page</h1>
                    <img src="hero.jpg" alt="Hero image" width="1200" height="600" loading="eager" fetchpriority="high" />
                    <h2>Details</h2>
                    <a href="/more">Learn more</a>
                    <h3>Specs</h3>
                    <p>Some content</p>
                </div>`,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('CSS @import external URL', () => {
        it('flags @import url() with https', async () => {
            const ctx = makeContext(
                `<style>@import url('https://fonts.googleapis.com/css2?family=Inter');</style>
                <h1>Title</h1>`,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                {
                    severity: 'warning',
                    message: 'CSS @import of external URL "https://fonts.googleapis.com/css2?family=Inter" creates a chained blocking request that delays page rendering',
                    suggestion: 'Move this to a <link rel="stylesheet" href="..."> tag in the HTML <head> instead. This allows the browser preload scanner to discover both resources in parallel.',
                    element: '<style>',
                },
            ]);
        });

        it('flags @import string with http', async () => {
            const ctx = makeContext(
                `<style>@import 'http://example.com/styles.css';</style>
                <h1>Title</h1>`,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                {
                    severity: 'warning',
                    message: 'CSS @import of external URL "http://example.com/styles.css" creates a chained blocking request that delays page rendering',
                    suggestion: 'Move this to a <link rel="stylesheet" href="..."> tag in the HTML <head> instead. This allows the browser preload scanner to discover both resources in parallel.',
                    element: '<style>',
                },
            ]);
        });

        it('does not flag relative @import', async () => {
            const ctx = makeContext(
                `<style>@import './reset.css'; @import '../tokens/colors.css';</style>
                <h1>Title</h1>`,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('flags @import in linked CSS files', async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-test-'));
            const cssContent = `@import url('https://fonts.googleapis.com/css2?family=Inter');\nbody { margin: 0; }`;
            fs.writeFileSync(path.join(tmpDir, 'theme.css'), cssContent, 'utf-8');

            const ctx: JayHtmlValidationContext = {
                body: parse(
                    `<main><link rel="stylesheet" href="./theme.css"><h1>Title</h1></main>`,
                ),
                filePath: 'page.jay-html',
                projectRoot: tmpDir,
                headlessImports: [],
                head: completeHead,
            };

            const findings = await validate(ctx);
            expect(findings).toEqual([
                {
                    severity: 'warning',
                    message: 'CSS @import of external URL "https://fonts.googleapis.com/css2?family=Inter" creates a chained blocking request that delays page rendering',
                    suggestion: 'Move this to a <link rel="stylesheet" href="..."> tag in the HTML <head> instead. This allows the browser preload scanner to discover both resources in parallel.',
                    element: '<link href="./theme.css">',
                },
            ]);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });
    });
});
