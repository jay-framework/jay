import { Contract, ContractTag, ContractTagType } from '../../lib';
import { buildPageInteractivePaths } from '../../lib/jay-target/jay-html-compiler-phase';

/**
 * Design Log #236: a page contract with an interactive tag made the page interactive-path set
 * non-empty, so keyed headless `{key.x}` text and `if="key.x"` were skipped as non-interactive.
 * `buildPageInteractivePaths` adds the key of every keyed headless import that may change on the client.
 */
describe('buildPageInteractivePaths', () => {
    const interactiveTag: ContractTag = { tag: 'button', type: [ContractTagType.interactive] };
    const slowTag: ContractTag = { tag: 'title', type: [ContractTagType.data] };
    const fastTag: ContractTag = { tag: 'message', type: [ContractTagType.data], phase: 'fast' };

    const contractOf = (name: string, tags: ContractTag[]): Contract => ({ name, tags });
    const pageContract = contractOf('page', [interactiveTag]);
    const interactiveHeadless = contractOf('form', [interactiveTag]);
    const slowOnlyHeadless = contractOf('banner', [slowTag]);
    const fastOnlyHeadless = contractOf('status', [fastTag]);

    it('returns the empty set unchanged when the page has no interactive paths (all treated as interactive)', () => {
        const paths = buildPageInteractivePaths(undefined, [
            { key: 'form', contract: interactiveHeadless },
        ]);
        expect([...paths]).toEqual([]);
    });

    it('skips a headless import without a key', () => {
        const paths = buildPageInteractivePaths(pageContract, [{ contract: interactiveHeadless }]);
        expect([...paths]).toEqual(['button']);
    });

    it('adds every keyed headless import whose contract may change on the client', () => {
        const paths = buildPageInteractivePaths(pageContract, [
            { key: 'form', contract: interactiveHeadless },
            { key: 'other', contract: interactiveHeadless },
        ]);
        expect([...paths].sort()).toEqual(['button', 'form', 'other']);
    });

    it('does not add a keyed headless import whose contract is slow-only or fast-only', () => {
        const paths = buildPageInteractivePaths(pageContract, [
            { key: 'banner', contract: slowOnlyHeadless },
            { key: 'status', contract: fastOnlyHeadless },
        ]);
        expect([...paths]).toEqual(['button']);
    });

    it('adds a keyed headless import whose contract could not be loaded', () => {
        const paths = buildPageInteractivePaths(pageContract, [{ key: 'form' }]);
        expect([...paths].sort()).toEqual(['button', 'form']);
    });
});
