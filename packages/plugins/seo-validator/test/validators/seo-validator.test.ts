import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/seo-validator.js';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

function makeContext(html: string): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
    };
}

describe('seo-validator', () => {
    describe('img alt attribute', () => {
        it('flags img without alt', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" width="100" height="100" loading="lazy" /></div>',
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
                '<div><h1>Title</h1><img src="photo.jpg" alt="A photo" width="100" height="100" loading="lazy" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with empty alt (decorative)', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="bg.jpg" alt="" width="100" height="100" loading="lazy" /></div>',
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
                '<div><h1>Title</h1><a href="/"><img src="logo.png" alt="Home" width="50" height="50" loading="lazy" /></a></div>',
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
            const ctx = makeContext(
                '<div><h1>Title</h1><h2>Section</h2><h3>Sub</h3></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('image dimensions (CLS)', () => {
        it('flags img without width/height', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" loading="lazy" /></div>',
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
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="800" height="600" loading="lazy" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with inline style dimensions', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" style="width: 100%; height: auto;" loading="lazy" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with srcset (responsive)', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" srcset="photo-400.jpg 400w, photo-800.jpg 800w" sizes="(max-width: 600px) 400px, 800px" loading="lazy" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('image lazy loading', () => {
        it('flags img without loading attribute', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="100" height="100" /></div>',
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
                '<div><h1>Title</h1><img src="photo.jpg" alt="photo" width="100" height="100" loading="lazy" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with loading="eager"', async () => {
            const ctx = makeContext(
                '<div><h1>Title</h1><img src="hero.jpg" alt="hero" width="1200" height="600" loading="eager" /></div>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('clean page', () => {
        it('returns no findings for well-structured page', async () => {
            const ctx = makeContext(
                `<div>
                    <h1>Product Page</h1>
                    <img src="hero.jpg" alt="Hero image" width="1200" height="600" loading="eager" />
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
