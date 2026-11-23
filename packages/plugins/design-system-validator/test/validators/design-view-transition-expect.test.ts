import { describe, it, expect } from 'vitest';
import { validateViewTransitionExpect } from '../../lib/tools';
import { COMPONENT, makeContext, suppressed } from './cls-test-context';

const finding = {
    severity: 'warning',
    message:
        'Cross-document view transition is enabled without <link rel="expect" blocking="render">. The transition can start before above-the-fold content is parsed, so it pops in.',
    suggestion:
        'Add <link rel="expect" href="#main-content" blocking="render"> in <head>, pointing at an above-the-fold element id. If intentional, suppress with design-system: { allow-view-transition-no-expect: true } in <script type="application/jay-validations">. See agent-kit/designer/layout-stability.md',
    element: '@view-transition',
};

const ENABLED = '@view-transition { navigation: auto; }';
const link = (attrs: Record<string, string>) => ({
    rel: 'expect',
    href: [{ kind: 'static' as const, value: '#m' }],
    ...attrs,
});

const check = (css: string, overrides = {}) =>
    validateViewTransitionExpect(
        makeContext(`<html><head><style>${css}</style></head><body></body></html>`, overrides),
    );

describe('validateViewTransitionExpect (DL#242)', () => {
    it('warns without an expect link', async () => {
        expect(await check(ENABLED)).toEqual([finding]);
    });
    it('warns when head is undefined', async () => {
        expect(await check(ENABLED, { head: undefined })).toEqual([finding]);
    });
    it('passes with rel=expect blocking=render', async () => {
        expect(
            await check(ENABLED, { head: { meta: [], links: [link({ blocking: 'render' })] } }),
        ).toEqual([]);
    });
    it('warns when the expect link is not render-blocking', async () => {
        expect(await check(ENABLED, { head: { meta: [], links: [link({})] } })).toEqual([finding]);
    });
    it('navigation: none is fine', async () => {
        expect(await check('@view-transition { navigation: none; }')).toEqual([]);
    });
    it('no view transition', async () => {
        expect(await check('body { color: red; }')).toEqual([]);
    });
    it('component files are skipped', async () => {
        expect(await check(ENABLED, { filePath: COMPONENT })).toEqual([]);
    });
    it('suppression', async () => {
        expect(await check(ENABLED, suppressed('allow-view-transition-no-expect'))).toEqual([]);
    });
});
