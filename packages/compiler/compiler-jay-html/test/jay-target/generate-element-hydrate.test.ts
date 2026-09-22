import { prettify } from '@jay-framework/compiler-shared';
import {
    readFileAndGenerateElementHydrateFile,
    readFixtureElementHydrateFile,
} from '../test-utils/file-utils';
import { forEachInsidePureComponentError } from '../../lib/jay-target/jay-html-helpers';

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

        // DL#194 Phase C (Fork C) — a Tier 3 (coded) composite with a `body` slot hydrates by adopting
        // the SSR fragment the server rendered at the anchor. The overridden instance (`richCard`) mounts
        // the parent-built override fragment via `foreignChild(slots.body)`; the fragment adopts page-scope
        // coordinates (`S0/0/card:richCard/body/0`) and the parent drives its update via
        // `childCompHydrate(..., slots)`. The override's ref surfaces at `refs.richCard.body.cta`.
        it('for Tier 3 slot injection (DL#194 Phase C)', async () => {
            const folder = 'contracts/page-with-tier3-slot';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#187 — a structural (Tier 2) headfull component hydrates via the inline
        // identity passthrough and the prop getter carries the coerced static prop
        // values (enum member, number literal, boolean literal), matching the SSR.
        it('for structural (Tier 2) instance — coerced static props (DL#187)', async () => {
            const folder = 'contracts/page-with-structural-badge';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Phase 2a — a page-authored <override> with a dynamic binding
        // ({itemName}) resolves against the OUTER page scope. The hydrate compiler
        // emits `__parentContext: vs` into the child component props and the adopted
        // override text reads `_p1.itemName` (parentDepth === 1).
        it('for override binding to parent scope (DL#193)', async () => {
            const folder = 'contracts/page-with-override-parent-binding';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Phase 3 — a structural component's forwarded inner refs on the hydrate target: the
        // synthetic refs type is declared in the shared refs section and the adopt inline render fn
        // uses it (`getPublicAPI() as _HeadlessCard0Refs`), matching the element target.
        it('for forwarded inner ref from structural component (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-forwarded-ref';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Phase 3 — repeated forwarding composite (inside a forEach) on the hydrate target:
        // page-side ref uses the repeated synthetic type; the inline template's own refs stay single.
        it('for forwarded inner ref from structural component in forEach (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-forwarded-ref-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Phase 3 — two structural instances of the same composite embed the same inner
        // Counter; the shared helper types are declared once at the file level (dedup) on the hydrate
        // target too.
        it('for forwarded inner refs from two structural instances of the same composite (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-forwarded-ref-multi';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 §C + Phase 3 — an OVERRIDE-injected component (`<jay:Counter>` inside
        // `<override ref="slot">`) forwards its `cta` ref re-based to the OUTER (page / forEach item)
        // scope: the adopt-path `childComp(Counter, …)` carries the `(vs, _p1) => _p1` selector and the
        // composite mount site passes `__parentContext`, matching the element target.
        it('for override-injected forwarded ref carrying the outer scope (DL#193 §C)', async () => {
            const folder = 'contracts/page-with-override-forwarded-ref';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // DL#193 Phase 3 (§4 validation) — the hydrate target rejects a `forEach` inside a pure
        // (Tier 2) structural composite with the same exact diagnostic as the element target.
        it('rejects a forEach inside a pure (Tier 2) structural composite (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-foreach-in-pure-composite';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([forEachInsidePureComponentError('card')]);
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
    });
});
