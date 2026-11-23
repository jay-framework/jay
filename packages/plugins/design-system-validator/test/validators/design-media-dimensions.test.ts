import { describe, it, expect } from 'vitest';
import { validateMediaDimensions } from '../../lib/tools';
import { COMPONENT, makeContext, suppressed } from './cls-test-context';

const SUGGESTION =
    'Add width and height attributes, or aspect-ratio + object-fit on the element itself (not on a wrapper). If intentional, suppress with design-system: { allow-media-no-dimensions: true } in <script type="application/jay-validations">. See agent-kit/designer/layout-stability.md';

const videoFinding = {
    severity: 'warning',
    message:
        '<video> has no width/height or aspect-ratio. It renders at 300x150, then jumps when the video metadata loads (CLS).',
    suggestion: SUGGESTION,
    element: '<video>',
    attribute: 'width',
};

const iframeFinding = {
    severity: 'warning',
    message:
        '<iframe> has no width/height or aspect-ratio. It renders at the 300x150 default and shifts the layout when the embed or a script resizes it (CLS).',
    suggestion: SUGGESTION,
    element: '<iframe>',
    attribute: 'width',
};

const page = (body: string, css = '') =>
    `<html><head><style>${css}</style></head><body>${body}</body></html>`;

const check = (body: string, css = '', overrides = {}) =>
    validateMediaDimensions(makeContext(page(body, css), overrides));

describe('validateMediaDimensions (DL#242)', () => {
    it('warns on an unsized video', async () => {
        expect(await check('<video src="/v.mp4"></video>')).toEqual([videoFinding]);
    });
    it('warns on an unsized iframe', async () => {
        expect(await check('<iframe src="/e"></iframe>')).toEqual([iframeFinding]);
    });
    it('checks component files too', async () => {
        expect(await check('<video src="/v.mp4"></video>', '', { filePath: COMPONENT })).toEqual([
            videoFinding,
        ]);
    });
    it('a component suppresses in its own head', async () => {
        const ctx = { filePath: COMPONENT, ...suppressed('allow-media-no-dimensions') };
        expect(await check('<video src="/v.mp4"></video>', '', ctx)).toEqual([]);
    });
    it('a page suppresses with the same key', async () => {
        expect(
            await check(
                '<video src="/v.mp4"></video>',
                '',
                suppressed('allow-media-no-dimensions'),
            ),
        ).toEqual([]);
    });
    it('passes with width and height attributes', async () => {
        expect(await check('<video width="640" height="360"></video>')).toEqual([]);
    });
    it('passes with bound width and height', async () => {
        expect(await check('<video width="{w}" height="{h}"></video>')).toEqual([]);
    });
    it('warns on empty width and height', async () => {
        expect(await check('<video width="" height=""></video>')).toEqual([videoFinding]);
    });
    it('passes with aspect-ratio from a class', async () => {
        expect(await check('<video class="v"></video>', '.v { aspect-ratio: 16/9; }')).toEqual([]);
    });
    it('passes with inline aspect-ratio', async () => {
        expect(await check('<video style="aspect-ratio:16/9"></video>')).toEqual([]);
    });
    it('passes with CSS width and height', async () => {
        expect(
            await check('<video class="v"></video>', '.v { width: 640px; height: 360px; }'),
        ).toEqual([]);
    });
    it('warns on width:100%; height:auto', async () => {
        expect(
            await check('<video class="v"></video>', '.v { width: 100%; height: auto; }'),
        ).toEqual([videoFinding]);
    });
    it('aspect-ratio on a wrapper does not count', async () => {
        expect(
            await check('<div class="w"><video></video></div>', '.w { aspect-ratio: 16/9; }'),
        ).toEqual([videoFinding]);
    });
    it('skips an absolutely positioned video', async () => {
        expect(await check('<video class="v"></video>', '.v { position: absolute; }')).toEqual([]);
    });
    it('warns on a mix of width attribute and CSS height', async () => {
        expect(
            await check('<video width="640" class="v"></video>', '.v { height: 360px; }'),
        ).toEqual([videoFinding]);
    });
    it('is lenient on aspect-ratio inside @supports', async () => {
        expect(
            await check(
                '<video class="v"></video>',
                '@supports (aspect-ratio: 1) { .v { aspect-ratio: 16/9; } }',
            ),
        ).toEqual([]);
    });
    it('skips a hidden iframe', async () => {
        expect(await check('<iframe hidden></iframe>')).toEqual([]);
    });
    it('skips a display:none iframe', async () => {
        expect(await check('<iframe class="t"></iframe>', '.t { display: none; }')).toEqual([]);
    });
    it('only base styles count, not @media', async () => {
        expect(
            await check(
                '<video class="v"></video>',
                '@media (min-width: 600px) { .v { aspect-ratio: 16/9; } }',
            ),
        ).toEqual([videoFinding]);
    });
});
