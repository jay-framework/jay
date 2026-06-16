import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/a11y-validator.js';
import type { JayHtmlValidationContext, JayHtmlHeadMeta } from '@jay-framework/compiler-shared';

function makeContext(html: string, head?: JayHtmlHeadMeta): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
        head,
    };
}

describe('a11y-validator', () => {
    describe('img alt', () => {
        it('flags img without alt', async () => {
            const ctx = makeContext('<img src="photo.jpg" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<img>',
                    message: expect.stringContaining('WCAG 1.1.1'),
                }),
            ]);
        });

        it('passes img with alt', async () => {
            const ctx = makeContext('<img src="photo.jpg" alt="A photo" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes img with empty alt (decorative)', async () => {
            const ctx = makeContext('<img src="bg.jpg" alt="" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('form label association', () => {
        it('flags input without label', async () => {
            const ctx = makeContext('<input type="text" id="name" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<input>',
                    message: expect.stringContaining('WCAG 1.3.1'),
                }),
            ]);
        });

        it('passes input with label[for]', async () => {
            const ctx = makeContext(
                '<label for="name">Name</label><input type="text" id="name" />',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes input wrapped in label', async () => {
            const ctx = makeContext('<label>Name <input type="text" /></label>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes input with aria-label', async () => {
            const ctx = makeContext('<input type="text" aria-label="Search" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('ignores hidden inputs', async () => {
            const ctx = makeContext('<input type="hidden" name="csrf" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('ignores submit buttons', async () => {
            const ctx = makeContext('<input type="submit" value="Go" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('flags select without label', async () => {
            const ctx = makeContext('<select id="country"><option>US</option></select>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<select>',
                }),
            ]);
        });

        it('flags textarea without label', async () => {
            const ctx = makeContext('<textarea id="bio"></textarea>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<textarea>',
                }),
            ]);
        });
    });

    describe('button accessible name', () => {
        it('flags empty button', async () => {
            const ctx = makeContext('<button></button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<button>',
                    message: expect.stringContaining('WCAG 4.1.2'),
                }),
            ]);
        });

        it('passes button with text', async () => {
            const ctx = makeContext('<button>Submit</button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes button with aria-label', async () => {
            const ctx = makeContext('<button aria-label="Close"></button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('tabindex', () => {
        it('flags positive tabindex', async () => {
            const ctx = makeContext('<button tabindex="5">Click</button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('WCAG 2.4.3'),
                }),
            ]);
        });

        it('passes tabindex="0"', async () => {
            const ctx = makeContext('<button tabindex="0">Click</button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes tabindex="-1"', async () => {
            const ctx = makeContext('<button tabindex="-1">Click</button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('media autoplay', () => {
        it('flags video autoplay without muted', async () => {
            const ctx = makeContext('<video autoplay src="clip.mp4"></video>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<video>',
                    message: expect.stringContaining('WCAG 1.4.2'),
                }),
            ]);
        });

        it('passes video autoplay with muted', async () => {
            const ctx = makeContext('<video autoplay muted src="clip.mp4"></video>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes video without autoplay', async () => {
            const ctx = makeContext('<video src="clip.mp4" controls></video>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('flags audio autoplay without muted', async () => {
            const ctx = makeContext('<audio autoplay src="song.mp3"></audio>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<audio>',
                }),
            ]);
        });
    });

    describe('ARIA roles', () => {
        it('flags invalid role', async () => {
            const ctx = makeContext('<div role="fancy">Content</div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    element: '<div>',
                    attribute: 'role',
                    message: expect.stringContaining('Invalid ARIA role'),
                }),
            ]);
        });

        it('passes valid role', async () => {
            const ctx = makeContext('<div role="navigation">Nav</div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes role="button"', async () => {
            const ctx = makeContext('<span role="button" tabindex="0">Click</span>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes role="none" (presentation)', async () => {
            const ctx = makeContext('<img src="spacer.gif" alt="" role="none" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('focusable without role', () => {
        it('flags div with tabindex="0" but no role', async () => {
            const ctx = makeContext('<div tabindex="0">Clickable</div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<div>',
                    attribute: 'role',
                    message: expect.stringContaining('focusable'),
                }),
            ]);
        });

        it('flags span with tabindex="0" but no role', async () => {
            const ctx = makeContext('<span tabindex="0">Link-like</span>');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<span>',
                }),
            ]);
        });

        it('passes div with tabindex="0" and role', async () => {
            const ctx = makeContext('<div tabindex="0" role="button">Click me</div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes div with tabindex="-1" (programmatic focus only)', async () => {
            const ctx = makeContext('<div tabindex="-1">Modal target</div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('does not flag interactive elements without role', async () => {
            const ctx = makeContext('<button tabindex="0">OK</button>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('viewport zoom', () => {
        it('flags user-scalable=no', async () => {
            const ctx = makeContext('<div>Content</div>', {
                title: 'Test',
                meta: [{ name: 'viewport', content: 'width=device-width, user-scalable=no' }],
                links: [],
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('WCAG 1.4.4'),
                }),
            ]);
        });

        it('flags maximum-scale less than 2', async () => {
            const ctx = makeContext('<div>Content</div>', {
                title: 'Test',
                meta: [{ name: 'viewport', content: 'width=device-width, maximum-scale=1.0' }],
                links: [],
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('1.0'),
                }),
            ]);
        });

        it('passes viewport with maximum-scale=2 or higher', async () => {
            const ctx = makeContext('<div>Content</div>', {
                title: 'Test',
                meta: [{ name: 'viewport', content: 'width=device-width, maximum-scale=5' }],
                links: [],
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('passes standard viewport without zoom restrictions', async () => {
            const ctx = makeContext('<div>Content</div>', {
                title: 'Test',
                meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
                links: [],
            });
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('does not check viewport when no head info', async () => {
            const ctx = makeContext('<div>Content</div>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('clean page', () => {
        it('returns no findings for accessible page', async () => {
            const ctx = makeContext(
                `<div>
                    <img src="hero.jpg" alt="Hero image" />
                    <label for="search">Search</label>
                    <input type="text" id="search" />
                    <button>Submit</button>
                    <video muted autoplay src="bg.mp4"></video>
                    <a href="/about">About us</a>
                    <div role="navigation" tabindex="0">Nav</div>
                </div>`,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });
});
