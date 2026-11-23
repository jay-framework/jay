import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fsp } from 'fs';
import { checkDirectDocumentAccess, checkTouchListeners } from '../lib/validate';

/** DL#243 — SWIPE-TOUCH-LISTENER line scan (rows 22–30 of the design log). */

const TAIL =
    ' — build swipes with CSS scroll-snap, or pointer events for drag. ' +
    'Suppress with // jay-gesture: allow on the same line. See agent-kit/developer/component-refs.md#gestures';

const warning = (file: string, line: number, match: string) =>
    `[SWIPE-TOUCH-LISTENER] ${file}:${line} — Touch listener "${match}"${TAIL}`;

async function component(lines: string[], basename = 'page'): Promise<string> {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dl243-'));
    await fsp.writeFile(
        path.join(dir, `${basename}.jay-html`),
        '<html><body><div></div></body></html>',
    );
    await fsp.writeFile(path.join(dir, `${basename}.ts`), lines.join('\n') + '\n');
    return path.join(dir, `${basename}.jay-html`);
}

describe('checkTouchListeners (DL#243)', () => {
    it('22: addEventListener touchmove, with its line', async () => {
        const file = await component([
            'const x = 1;',
            "refs.card.addEventListener('touchmove', onMove);",
        ]);
        expect(checkTouchListeners(file)).toEqual([
            warning('page.ts', 2, "addEventListener('touchmove'"),
        ]);
    });

    it('23: double-quoted touchstart', async () => {
        const file = await component(['refs.card.addEventListener("touchstart", onStart);']);
        expect(checkTouchListeners(file)).toEqual([
            warning('page.ts', 1, 'addEventListener("touchstart"'),
        ]);
    });

    it('24: ontouch* ref handlers', async () => {
        const file = await component([
            'refs.x.ontouchend(() => {});',
            'refs.x.ontouchstart$((e) => e);',
            'refs.x.ontouchcancel(() => {});',
        ]);
        expect(checkTouchListeners(file)).toEqual([
            warning('page.ts', 1, '.ontouchend('),
            warning('page.ts', 2, '.ontouchstart$('),
            warning('page.ts', 3, '.ontouchcancel('),
        ]);
    });

    it('25: touchcancel listener', async () => {
        const file = await component(["el.addEventListener('touchcancel', reset);"]);
        expect(checkTouchListeners(file)).toEqual([
            warning('page.ts', 1, "addEventListener('touchcancel'"),
        ]);
    });

    it('26: pointermove is not flagged', async () => {
        const file = await component(["refs.handle.addEventListener('pointermove', onDrag);"]);
        expect(checkTouchListeners(file)).toEqual([]);
    });

    it('27: // jay-gesture: allow suppresses the line', async () => {
        const file = await component([
            "refs.x.addEventListener('touchmove', f); // jay-gesture: allow",
        ]);
        expect(checkTouchListeners(file)).toEqual([]);
    });

    it('28: // jay-dom: allow does not suppress the gesture warning', async () => {
        const file = await component([
            "refs.x.addEventListener('touchmove', f); // jay-dom: allow",
        ]);
        expect(checkTouchListeners(file)).toEqual([
            warning('page.ts', 1, "addEventListener('touchmove'"),
        ]);
    });

    it('29: a <basename>.ts component file is scanned', async () => {
        const file = await component(["refs.x.addEventListener('touchend', f);"], 'card');
        expect(checkTouchListeners(file)).toEqual([
            warning('card.ts', 1, "addEventListener('touchend'"),
        ]);
    });

    it('30: document touch listener gives one DOM warning and one gesture warning', async () => {
        const file = await component(["document.addEventListener('touchmove', f);"]);
        expect(checkDirectDocumentAccess(file, { hasA11yValidator: false })).toHaveLength(1);
        expect(checkTouchListeners(file)).toEqual([
            warning('page.ts', 1, "addEventListener('touchmove'"),
        ]);
    });
});
