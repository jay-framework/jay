import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { validate } from '../../lib/validators/a11y-validator.js';

function makeContext(css: string): JayHtmlValidationContext {
    return {
        body: parse('<div></div>'),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
        css,
    };
}

describe('hover-only disclosure CSS (WCAG 2.1.1)', () => {
    it('flags hover-only submenu reveal without focus twin when a hidden base exists', async () => {
        const ctx = makeContext(`
            .nav li > ul { display: none; }
            .nav li:hover > ul { display: block; }
        `);
        const findings = await validate(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'warning',
                ruleId: 'a11y/allow-hover-only-disclosure',
                message: expect.stringContaining('.nav li:hover > ul'),
            }),
        ]);
    });

    it('flags tooltip-style reveal when the target has a hidden base', async () => {
        const ctx = makeContext(`
            .tip .bubble { opacity: 0; }
            .tip:hover .bubble { opacity: 1; }
        `);
        const findings = await validate(ctx);
        expect(
            findings.some((f) => f.ruleId === 'a11y/allow-hover-only-disclosure'),
        ).toBe(true);
    });

    it('passes when a focus-within twin exists', async () => {
        const ctx = makeContext(`
            .nav li > ul { display: none; }
            .nav li:hover > ul { display: block; }
            .nav li:focus-within > ul { display: block; }
        `);
        const findings = await validate(ctx);
        const hover = findings.find((f) => f.ruleId === 'a11y/allow-hover-only-disclosure');
        expect(hover).toBeUndefined();
    });

    it('passes self-paired :is(:hover, :focus-within)', async () => {
        const ctx = makeContext(`
            .nav li > ul { display: none; }
            .nav li:is(:hover, :focus-within) > ul { display: block; }
        `);
        const findings = await validate(ctx);
        const hover = findings.find((f) => f.ruleId === 'a11y/allow-hover-only-disclosure');
        expect(hover).toBeUndefined();
    });

    it('does not flag hover on the revealed element itself', async () => {
        const ctx = makeContext(`
            .btn:hover { opacity: 0.8; }
        `);
        const findings = await validate(ctx);
        const hover = findings.find((f) => f.ruleId === 'a11y/allow-hover-only-disclosure');
        expect(hover).toBeUndefined();
    });

    it('does not flag hover reveal on ::after pseudo-elements', async () => {
        const ctx = makeContext(`
            .o .m::after { opacity: 0; }
            .o:hover .m::after { opacity: 1; }
        `);
        const findings = await validate(ctx);
        const hover = findings.find((f) => f.ruleId === 'a11y/allow-hover-only-disclosure');
        expect(hover).toBeUndefined();
    });

    it('does not flag decorative hover without a provably hidden base', async () => {
        const ctx = makeContext(`
            .card:hover .arrow { transform: rotate(90deg); }
        `);
        const findings = await validate(ctx);
        const hover = findings.find((f) => f.ruleId === 'a11y/allow-hover-only-disclosure');
        expect(hover).toBeUndefined();
    });

    it('flags product-card quick actions hidden until hover', async () => {
        const ctx = makeContext(`
            .product-card .quick-options-buttons { display: none; }
            .product-card:hover .quick-options-area .quick-options-buttons { display: flex; }
        `);
        const findings = await validate(ctx);
        expect(
            findings.some((f) => f.ruleId === 'a11y/allow-hover-only-disclosure'),
        ).toBe(true);
    });

    it('suppresses via a11y: { allow-hover-only-disclosure: true }', async () => {
        const ctx: JayHtmlValidationContext = {
            ...makeContext(`
                .nav li > ul { display: none; }
                .nav li:hover > ul { display: block; }
            `),
            validationOverrides: { a11y: { 'allow-hover-only-disclosure': true } },
        };
        const findings = await validate(ctx);
        const hover = findings.find((f) => f.ruleId === 'a11y/allow-hover-only-disclosure');
        expect(hover).toBeUndefined();
    });
});
