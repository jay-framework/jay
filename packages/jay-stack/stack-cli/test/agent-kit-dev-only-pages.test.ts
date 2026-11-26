import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

// DL#240 — agents generating tooling pages must be able to discover the dev-only marker, its
// limits, and every validate rule from the agent-kit they are given.

const kit = path.resolve('./agent-kit-template');
const read = (relativePath: string) => fs.readFileSync(path.join(kit, relativePath), 'utf-8');
const MARKER = '<meta name="jay-dev-only"';
const RULE_CODES = [
    'DEV-ONLY-LINKED-FROM-PROD',
    'DEV-ONLY-ERROR-PAGE',
    'DEV-ONLY-INVALID-CONTENT',
    'DEV-ONLY-MARKER-NOT-IN-HEAD',
    'DEV-ONLY-SHADOWS-PLUGIN-ROUTE',
];

describe('agent-kit — dev-only project pages (DL#240)', () => {
    it('documents the marker, its restart caveat, and what still ships in designer/routing.md', () => {
        const guide = read('designer/routing.md');
        expect(guide.includes('## Dev-Only Pages')).toBe(true);
        expect(guide.includes(MARKER)).toBe(true);
        expect(/restart/i.test(guide)).toBe(true);
        expect(guide.includes('src/actions')).toBe(true);
        expect(guide.includes('public/')).toBe(true);
    });

    it('points developers and plugin authors at the marker', () => {
        for (const file of ['developer/routing.md', 'plugin/plugin-routes.md']) {
            expect({ file, mentionsMarker: read(file).includes(MARKER) }).toEqual({
                file,
                mentionsMarker: true,
            });
        }
    });

    it('notes in both dev-server-service guides that listRoutes() devOnly covers project pages and goes stale until restart', () => {
        for (const file of ['plugin/dev-server-service.md', 'developer/dev-server-service.md']) {
            const guide = read(file);
            expect({
                file,
                mentionsMarker: guide.includes(MARKER),
                mentionsRestart: /restart/i.test(guide),
            }).toEqual({ file, mentionsMarker: true, mentionsRestart: true });
        }
    });

    it('lists all five rule codes in designer/validation-guide.md', () => {
        const guide = read('designer/validation-guide.md');
        expect(RULE_CODES.filter((code) => !guide.includes(code))).toEqual([]);
    });
});
