import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { scratchPreviewOutputRouteDir } from '../lib/render-scratch-page-preview.js';

describe('scratchPreviewOutputRouteDir', () => {
    const projectBase = '/project/examples/starter';

    it('maps .aiditor/scratch batch option paths to unique pre-render dirs', () => {
        const scratchPath = path.join(
            projectBase,
            '.aiditor/scratch/explore_abc/option-b/src/pages/page.jay-html',
        );
        expect(scratchPreviewOutputRouteDir(projectBase, scratchPath)).toBe(
            'scratch/explore_abc/option-b',
        );
    });

    it('uses a hash fallback for paths outside .aiditor/scratch layout', () => {
        const scratchPath = '/tmp/custom-scratch/page.jay-html';
        expect(scratchPreviewOutputRouteDir(projectBase, scratchPath)).toMatch(/^scratch\/[a-f0-9]{16}$/);
    });

    it('produces distinct dirs for sibling explore options', () => {
        const batch = 'explore_test_batch';
        const optionA = path.join(
            projectBase,
            `.aiditor/scratch/${batch}/option-a/src/pages/page.jay-html`,
        );
        const optionB = path.join(
            projectBase,
            `.aiditor/scratch/${batch}/option-b/src/pages/page.jay-html`,
        );
        expect(scratchPreviewOutputRouteDir(projectBase, optionA)).not.toBe(
            scratchPreviewOutputRouteDir(projectBase, optionB),
        );
    });
});
