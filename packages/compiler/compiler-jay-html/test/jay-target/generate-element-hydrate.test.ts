import { prettify } from '@jay-framework/compiler-shared';
import {
    readFileAndGenerateElementHydrateFile,
    readFixtureElementHydrateFile,
} from '../test-utils/file-utils';
describe('generate jay-html element hydrate', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for html-string binding', async () => {
            const folder = 'basics/html-string-binding';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for composite with dynamic text', async () => {
            const folder = 'basics/composite';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for refs with dynamic text', async () => {
            const folder = 'basics/refs';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for attributes with dynamic bindings only', async () => {
            const folder = 'basics/attributes';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for style bindings (dynamic style properties are adopted)', async () => {
            const folder = 'basics/style-bindings';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for dynamic attribute parent with child ref', async () => {
            const folder = 'basics/dynamic-attr-with-child-ref';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for mixed content dynamic text (adoptText by position, DL#102)', async () => {
            const folder = 'basics/mixed-content-dynamic-text';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for phase-aware dynamic text (only interactive bindings adopted)', async () => {
            const folder = 'basics/phase-aware-dynamic-text';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for phase-aware conditionals (only interactive conditions adopted)', async () => {
            const folder = 'basics/phase-aware-conditionals';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('conditions', () => {
        it('for basic if/else conditions', async () => {
            const folder = 'conditions/conditions';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for conditions with refs', async () => {
            const folder = 'conditions/conditions-with-refs';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for conditions with static sibling containing dynamic content', async () => {
            const folder = 'conditions/conditions-with-static-sibling';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('collections', () => {
        it('for basic forEach', async () => {
            const folder = 'collections/collections';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for forEach with dynamic class on item element', async () => {
            const folder = 'collections/foreach-dynamic-class';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Capability A — `$parent` bindings inside a forEach emit `dependsOnParent`
        // on hydrateForEach so a parent-only change re-runs item leaves during hydration.
        it('for a $parent binding inside a forEach', async () => {
            const folder = 'collections/foreach-parent-binding';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Capability A — `$parent.$parent` forces both nested hydrateForEach loops.
        it('for a $parent.$parent binding inside nested forEach', async () => {
            const folder = 'collections/foreach-parent-binding-grandparent';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // Regression: a non-interactive (slow/fast) conditional inside a forEach item must
        // guard against the item ViewState (vs1), not the page ViewState (viewState). The
        // adopt callback receives the item so `...(vs1.name ? [...] : [])` is emitted —
        // previously it wrongly emitted `...(viewState.name ? ...)`, so adoptElement targeted
        // a coordinate that wasn't in the DOM and hydration warned "coordinate not found".
        it('for non-interactive conditional inside forEach', async () => {
            const folder = 'collections/conditional-in-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('duplicate refs', () => {
        it('for headless contract with duplicate ref names', async () => {
            const folder = 'collections/duplicate-ref-only-one-used';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for same ref name in different branches', async () => {
            const folder = 'collections/duplicate-ref-different-branches';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('components', () => {
        it('for counter component', async () => {
            const folder = 'components/counter';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for component in component', async () => {
            const folder = 'components/component-in-component';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('kebab-case component names resolve to camelCase imports', async () => {
            const folder = 'components/kebab-case-component';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // Note: keyed headless validation is tested in generate-element.test.ts (standard compiler).
        // The hydrate compiler has the same validation but the test resolver doesn't support
        // keyed headless plugin resolution in the hydrate fixture setup.
    });

    describe('headless instances', () => {
        it('headless instance with forEach in template resolves bindings', async () => {
            const folder = 'contracts/page-with-headless-foreach-template';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            // Must contain hydrateForEach for the words array — not a direct adoptText
            expect(hydrateFile.val).toMatch(/hydrateForEach|forEach/);
            expect(hydrateFile.val).toMatch(/\.words/);
        });

        it('for page-level headless component', async () => {
            const folder = 'contracts/page-using-counter';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for simple headless instance', async () => {
            const folder = 'contracts/page-with-headless-instance';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#196 — a coded (`src=`) headless region flattens the card template into the page and hydrates
        // it via `makeHeadlessInstanceComponent(renderFn, card, coord)`. The two `<jay:card>` regions carry
        // the card body as source-owned markup (no slots/overrides); each hydrates its own `childComp`.
        it('for coded region (DL#196)', async () => {
            const folder = 'contracts/page-with-coded-region';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#196 under repetition: the parent repeats a coded card region via forEach. The flattened
        // render fn is hoisted once; each item mounts its own `childComp(_HeadlessCard0, …, refRichCards())`
        // with a keyed coordinate function, wiring its own collection ref.
        it('for coded region under a parent forEach (DL#196)', async () => {
            const folder = 'contracts/page-with-coded-region-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#196 — a no-code structural passthrough region hydrates via the inline
        // identity passthrough and the prop getter carries the coerced static prop
        // values (enum member, number literal, boolean literal), matching the SSR.
        it('for no-code structural passthrough instance — coerced static props (DL#196)', async () => {
            const folder = 'contracts/page-with-structural-badge';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for headless instance inside forEach', async () => {
            const folder = 'contracts/page-with-headless-in-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for headless instance as root element', async () => {
            const folder = 'contracts/page-with-headless-root-instance';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
        });

        it('for headless instance inside keyed headless forEach', async () => {
            const folder = 'contracts/headless-instance-in-keyed-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#198 Design D (D-4 hydrate parity) — the hydrate twin of the element-target free-ref tests. The
        // adopt render function lists the free ref in the region's ReferencesManager, the factory receives the
        // free-ref names (`makeHeadlessInstanceComponent(..., ['dismiss'])`), the page wires a per-region
        // FreeReferenceManager via `setFreeRefManager`, and `childCompHydrate` (and, for conditionals/list
        // additions, `childComp`) receives it — so `refs.<region>.<freeRef>` survives hydration.
        it('for a region free ref as a boundary event source (DL#198 D-1)', async () => {
            const folder = 'contracts/page-with-free-ref';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for a collection of regions each carrying a free ref (DL#198 Case 1)', async () => {
            const folder = 'contracts/page-with-free-ref-collection';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for a free ref inside a region-internal forEach (DL#198 Case 2)', async () => {
            const folder = 'contracts/page-with-free-ref-in-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });
});
