import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateTokens } from '../../lib';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import path from 'node:path';

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'basic');
const DESIGN_MD = 'DESIGN.md';
const GUIDE = 'agent-kit/designer/design-system.md';
const REFS = `\nSee ${DESIGN_MD} for tokens, ${GUIDE} for usage guide.`;

function makeContext(html: string): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: path.join(fixturesDir, 'page.jay-html'),
        projectRoot: fixturesDir,
        headlessImports: [],
    };
}

describe('design-tokens validator', () => {
    it('flags hardcoded color not in tokens', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { color: #ff0000; }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'Hardcoded color "#ff0000" for color not in design system',
                suggestion: `Use token {colors.error} ("#dc2626")${REFS}`,
                element: '<div>',
            },
        ]);
    });

    it('passes token colors', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { color: #2563eb; }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags spacing not in scale', async () => {
        const ctx = makeContext(`<html><body>
            <style>.box { padding: 13px; }</style>
            <div class="box">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'padding value "13px" not in spacing scale',
                suggestion: `Use a spacing token: {spacing.xs} ("0.25rem"), {spacing.sm} ("0.5rem"), {spacing.md} ("1rem"), {spacing.lg} ("1.5rem"), {spacing.xl} ("2rem")${REFS}`,
                element: '<div>',
            },
        ]);
    });

    it('passes spacing in scale', async () => {
        const ctx = makeContext(`<html><body>
            <style>.box { padding: 1rem; }</style>
            <div class="box">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags border-radius not in rounded scale', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { border-radius: 10px; }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'border-radius "10px" not in rounded scale',
                suggestion: `Use a rounded token: {rounded.none} ("0"), {rounded.sm} ("0.25rem"), {rounded.md} ("0.5rem"), {rounded.lg} ("0.75rem"), {rounded.full} ("9999px")${REFS}`,
                element: '<div>',
            },
        ]);
    });

    it('skips declarations with design-system: allow comment', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { padding: 13px; /* design-system: allow */ }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('skips elements with jay-design="allow"', async () => {
        const ctx = makeContext(`<html><body>
            <div style="padding: 13px" jay-design="allow">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('allows var() references', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { color: var(--color-primary); }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags violations inside media queries with breakpoint label', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .card { color: #2563eb; }
                @media (max-width: 768px) {
                    .card { padding: 13px; }
                }
            </style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: '[(max-width: 768px)] padding value "13px" not in spacing scale',
                suggestion: `Use a spacing token: {spacing.xs} ("0.25rem"), {spacing.sm} ("0.5rem"), {spacing.md} ("1rem"), {spacing.lg} ("1.5rem"), {spacing.xl} ("2rem")${REFS}`,
                element: '<div>',
            },
        ]);
    });

    it('validates base and media query rules independently', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .card { padding: 1rem; }
                @media (max-width: 768px) {
                    .card { padding: 0.5rem; }
                }
            </style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags animation duration not in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-duration: 200ms; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'transition-duration "200ms" not in animation presets',
                suggestion: `Use an animation preset duration: fade-in (300ms), micro (150ms)${REFS}`,
                element: '<div>',
            },
        ]);
    });

    it('passes animation duration in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-duration: 300ms; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags animation easing not in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-timing-function: ease; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; transition-timing-function: ease; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'transition-timing-function "ease" not in animation presets',
                suggestion: `Use an animation preset easing: fade-in (cubic-bezier(0, 0, 0.2, 1)), micro (ease-in-out)${REFS}`,
                element: '<div>',
            },
            {
                severity: 'warning',
                message:
                    '[(prefers-reduced-motion: reduce)] transition-timing-function "ease" not in animation presets',
                suggestion: `Use an animation preset easing: fade-in (cubic-bezier(0, 0, 0.2, 1)), micro (ease-in-out)${REFS}`,
                element: '<div>',
            },
        ]);
    });

    it('passes animation easing in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-timing-function: ease-in-out; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('warns when animations exist but no prefers-reduced-motion', async () => {
        const ctx = makeContext(`<html><body>
            <style>.fade { transition: opacity 300ms; }</style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'Page uses transitions/animations but has no @media (prefers-reduced-motion) override',
                suggestion: `Add @media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; animation-duration: 0s !important; } }${REFS}`,
            },
        ]);
    });

    it('passes when prefers-reduced-motion is present', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition: opacity 300ms; }
                @media (prefers-reduced-motion: reduce) {
                    .fade { transition-duration: 0s; }
                }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('returns no findings when no DESIGN.md', async () => {
        const ctx = {
            body: parse(
                '<html><body><style>.x{color:red}</style><div class="x">X</div></body></html>',
            ),
            filePath: '/nonexistent/page.jay-html',
            projectRoot: '/nonexistent',
            headlessImports: [],
        };
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });
});
