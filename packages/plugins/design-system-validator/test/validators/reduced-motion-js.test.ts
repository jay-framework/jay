import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { validateReducedMotionJs } from '../../lib/tools';

const PROJECT = resolve(__dirname, '../fixtures/reduced-motion-js/project');
const SUGGESTION =
    "Check window.matchMedia('(prefers-reduced-motion: reduce)').matches and use behavior: 'instant' / skip the animation when it is true. See design-system-validator agent-kit/designer/reduced-motion.md.";

describe('validateReducedMotionJs (DL#238)', () => {
    // One fixture project covers all cases: ungated .ts and .tsx files warn; a file that
    // mentions prefers-reduced-motion, .d.ts, *.test.ts and test/ files are skipped.
    it('should warn per ungated file with the first matching line, skipping gated and test files', async () => {
        expect(await validateReducedMotionJs({ projectRoot: PROJECT })).toEqual([
            {
                severity: 'warning',
                file: 'src/components/spin.tsx',
                message:
                    '[reduced-motion/js-motion] line 2: .animate( runs motion without checking prefers-reduced-motion',
                suggestion: SUGGESTION,
            },
            {
                severity: 'warning',
                file: 'src/pages/scroll.ts',
                message:
                    "[reduced-motion/js-motion] line 2: behavior: 'smooth' runs motion without checking prefers-reduced-motion",
                suggestion: SUGGESTION,
            },
        ]);
    });

    it('should return no findings when the project has no src directory', async () => {
        expect(await validateReducedMotionJs({ projectRoot: resolve(PROJECT, 'src/lib') })).toEqual(
            [],
        );
    });
});
