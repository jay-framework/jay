import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/seo-validator.js';
import type { JayHtmlValidationContext, JayHtmlHeadMeta } from '@jay-framework/compiler-shared';

const completeHead: JayHtmlHeadMeta = {
    title: 'Test Page',
    meta: [{ name: 'description', content: 'Test description' }],
    links: [{ rel: 'canonical', href: 'https://example.com/test' }],
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
                    meta: [{ name: 'description', content: 'Desc' }],
                    links: [{ rel: 'canonical', href: '/' }],
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

        it('flags missing meta description', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: { title: 'Page', meta: [], links: [{ rel: 'canonical', href: '/' }] },
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

        it('flags missing canonical link', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: 'Page',
                    meta: [{ name: 'description', content: 'Desc' }],
                    links: [],
                },
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<link>',
                    message: expect.stringContaining('canonical'),
                }),
            ]);
        });

        it('flags noindex in robots meta', async () => {
            const ctx = makeContext('<div><h1>Title</h1></div>', {
                head: {
                    title: 'Page',
                    meta: [
                        { name: 'description', content: 'Desc' },
                        { name: 'robots', content: 'noindex, nofollow' },
                    ],
                    links: [{ rel: 'canonical', href: '/' }],
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
});
