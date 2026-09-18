import {
    readFixtureElementFile,
    readFixtureFile,
    readFixtureFileRaw,
} from '../test-utils/file-utils';
import { readFileAndGenerateElementFile } from '../test-utils/file-utils';
import { prettify, RuntimeMode } from '@jay-framework/compiler-shared';
import { forEachInsidePureComponentError } from '../../lib/jay-target/jay-html-helpers';

describe('generate jay-html element', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for simple file with static text', async () => {
            const folder = 'basics/simple-static-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for text with apostrophe', async () => {
            const folder = 'basics/text-with-apostrophe';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for html entities in text', async () => {
            const folder = 'basics/html-entities';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for html-string binding', async () => {
            const folder = 'basics/html-string-binding';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for an empty element', async () => {
            const folder = 'basics/empty-element';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for different data types', async () => {
            const folder = 'basics/data-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for a composition of divs', async () => {
            const folder = 'basics/composite';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for composition of divs 2', async () => {
            const folder = 'basics/composite 2';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for styles', async () => {
            const folder = 'basics/styles';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for styles with URLs containing single quotes', async () => {
            const folder = 'basics/styles-with-urls';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for style bindings', async () => {
            const folder = 'basics/style-bindings';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('refs', async () => {
            const folder = 'basics/refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('with different attributes and properties', async () => {
            const folder = 'basics/attributes';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('with different view state input types', async () => {
            const folder = 'basics/dynamic-text-input-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('whitespace collapsing and handling', async () => {
            const folder = 'basics/whitespace-and-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('head links injection', async () => {
            const folder = 'basics/head-links';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('conditions', () => {
        it('for conditional', async () => {
            const folder = 'conditions/conditions';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for conditional with refs', async () => {
            const folder = 'conditions/conditions-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for conditional with the same ref on different branches', async () => {
            const folder = 'conditions/conditions-with-repeated-ref';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for enums and conditions', async () => {
            const folder = 'conditions/conditions-with-enum';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('collections', () => {
        it('for collections', async () => {
            const folder = 'collections/collections';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for collections with refs', async () => {
            const folder = 'collections/collection-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Capability A — `$parent` text/attribute bindings inside a forEach compile
        // to a widened closure (`(vs1, _p1) => _p1.field`) and a `dependsOnParent` forEach flag.
        it('for a $parent binding inside a forEach', async () => {
            const folder = 'collections/foreach-parent-binding';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Capability A — `$parent.$parent` in a nested forEach flags BOTH loops so the
        // grandparent change reaches the inner leaf.
        it('for a $parent.$parent binding inside nested forEach', async () => {
            const folder = 'collections/foreach-parent-binding-grandparent';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Capability A — `$parent` at the root scope (no enclosing forEach/with-data)
        // is a compile-time error.
        it('reports $parent used at the root scope with no parent', async () => {
            const folder = 'basics/parent-at-root';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([
                '$parent used but there is no parent scope 1 level(s) up',
            ]);
        });

        it('for collections with repeated refs', async () => {
            const folder = 'collections/collection-with-repeating-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for nested collections with refs in variants', async () => {
            const folder = 'collections/nested-collection-with-refs-in-variants';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for collections with conditions', async () => {
            const folder = 'collections/collections-with-conditions';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for nested arrays with students', async () => {
            const folder = 'collections/nested-arrays-with-students';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for nested collections with repeating refs', async () => {
            const folder = 'collections/nested-collection-with-repeating-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for duplicate ref names in different branches', async () => {
            const folder = 'collections/duplicate-ref-different-branches';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for duplicate ref names where only one is used', async () => {
            const folder = 'collections/duplicate-ref-only-one-used';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for pre-rendered slow arrays with slowForEach', async () => {
            const folder = 'collections/slow-for-each';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('components', () => {
        describe('for main trusted environment (running in main window, component is not sandboxed)', () => {
            const importerMode: RuntimeMode = RuntimeMode.MainTrusted;
            it('for simple refs', async () => {
                const folder = 'components/counter';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('nesting components in other components', async () => {
                const folder = 'components/component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            }, 10000);

            it('kebab-case component names resolve to camelCase imports', async () => {
                const folder = 'components/kebab-case-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('headless instance with forEach in template resolves bindings correctly', async () => {
                const folder = 'contracts/page-with-headless-foreach-template';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
            });

            it('keyed headless used as inline element produces validation error', async () => {
                const folder = 'contracts/page-with-keyed-headless-element';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations.length).toBeGreaterThan(0);
                expect(elementFile.validations[0]).toMatch(/cannot be used as an inline element/);
            });

            it('keyed headless used as <jay:keyName> (key as tag) produces validation error', async () => {
                const folder = 'contracts/page-with-keyed-headless-as-tag';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations.length).toBeGreaterThan(0);
                expect(elementFile.validations[0]).toMatch(/cannot be used as an inline element/);
            });

            it('dynamic nesting components in other components', async () => {
                const folder = 'components/dynamic-component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('recursive-components', async () => {
                const folder = 'components/recursive-components';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('recursive-components-2', async () => {
                const folder = 'components/recursive-components-2';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('tree', async () => {
                const folder = 'components/tree';
                const elementFile = await readFileAndGenerateElementFile(folder, {
                    importerMode,
                    givenFile: 'tree-node',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });
        });

        describe('for main sandboxed environment (running in main window, component is sandboxed)', () => {
            const importerMode: RuntimeMode = RuntimeMode.MainSandbox;
            it('for simple refs', async () => {
                const folder = 'components/counter';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('nesting components in other components', async () => {
                const folder = 'components/component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('dynamic nesting components in other components', async () => {
                const folder = 'components/dynamic-component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('recursive-components', async () => {
                const folder = 'components/recursive-components';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('recursive-components-2', async () => {
                const folder = 'components/recursive-components-2';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('tree', async () => {
                const folder = 'components/tree';
                const elementFile = await readFileAndGenerateElementFile(folder, {
                    importerMode,
                    givenFile: 'tree-node',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            // DL#193 Phase 2a — the override renders main-side even when the component
            // is sandboxed, so `__parentContext: vs` and the `_p1.itemName` binding must
            // appear in the main-sandbox element output (only the contract import suffix
            // and headless factory differ from the trusted output).
            it('override binding to parent scope (DL#193)', async () => {
                const folder = 'contracts/page-with-override-parent-binding';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            // DL#193 Phase 4 — a $parent binding inside a forEach renders main-side even
            // when sandboxed: the main-sandbox output carries the same `_p1` closure
            // bindings (`da`/`dt` with `_p1.listTitle`) and the `dependsOnParent` forEach
            // flag as the trusted output. The worker only tracks the collection skeleton.
            it('$parent binding inside a forEach (DL#193)', async () => {
                const folder = 'collections/foreach-parent-binding';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            // DL#193 Phase 3 — a structural component's forwarded inner refs render main-side (the
            // inline template is inlined into the page), so the synthetic refs type and the
            // `refs.signupCard.cta` surface appear in the main-sandbox output; only the contract import
            // suffix (?jay-mainSandbox) and headless factory differ from the trusted output.
            it('forwarded inner ref from structural component (DL#193 Phase 3)', async () => {
                const folder = 'contracts/page-with-forwarded-ref';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            // DL#193 Phase 3 — repeated forwarding composite (inside a forEach) in main-sandbox mode:
            // the page-side instance ref uses the repeated synthetic type (collection refs).
            it('forwarded inner ref from structural component in forEach (DL#193 Phase 3)', async () => {
                const folder = 'contracts/page-with-forwarded-ref-foreach';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            // DL#193 Phase 3 refinement — the injected component is sandboxed (`secureChildComp`), yet
            // the override-injected forwarded ref still re-bases to the outer scope: the selector
            // `(vs, _p1) => _p1` and `__parentContext` appear in the main-sandbox output exactly as in
            // the trusted output (only the childComp variant differs).
            it('override-injected forwarded ref carrying the outer scope (DL#193 Phase 3)', async () => {
                const folder = 'contracts/page-with-override-forwarded-ref';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });
        });
    });

    describe('html namespaces', () => {
        it('for simple svg', async () => {
            const folder = 'html-namespaces/simple-svg';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for simple mathml', async () => {
            const folder = 'html-namespaces/simple-mathml';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('linked contract', () => {
        it('generate element file with linked contract', async () => {
            const folder = 'contracts/page-using-counter';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await prettify(await readFixtureFileRaw(folder, 'page-using-counter.jay-html.ts')),
            );
        });

        it('generate element file with headless component instance (inline template)', async () => {
            const folder = 'contracts/page-with-headless-instance';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await prettify(
                    await readFixtureFileRaw(folder, 'page-with-headless-instance.jay-html.ts'),
                ),
            );
        });

        // DL#187 — a structural (Tier 2) headfull component uses the inline identity
        // passthrough `{ comp: (_props, _refs) => ({ render: () => _props }) }` and the
        // prop getter coerces static attribute values to the declared prop types
        // (enum → member, number → literal, boolean → literal).
        it('generate element file with structural (Tier 2) instance — coerced static props (DL#187)', async () => {
            const folder = 'contracts/page-with-structural-badge';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Phase 2a — a page-authored <override> with a dynamic binding
        // ({itemName}) resolves against the OUTER page scope. The compiler emits
        // `__parentContext: vs` into the child component props and the override
        // body reads `_p1.itemName` (parentDepth === 1).
        it('generate element file with override binding to parent scope (DL#193)', async () => {
            const folder = 'contracts/page-with-override-parent-binding';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Phase 3 — a structural (Tier 2) component forwards its NAMED inner child-component
        // refs (`<jay:Counter ref="cta">`). The usage-site instance ref is a synthetic type
        // (`_HeadlessCard0Refs { cta: CounterRef<CardViewState> }`) declared in the shared refs
        // section, so `refs.signupCard.cta` is typed correctly. Element/plain refs stay private.
        it('generate element file with forwarded inner ref from structural component (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-forwarded-ref';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Phase 3 — when the forwarding composite is REPEATED (inside a page forEach), each
        // forwarded ref becomes a collection: the page-side instance ref uses the repeated synthetic
        // type (`_HeadlessCard0RepeatedRefs { cta: CounterRefs<CardViewState> }`) while the inline
        // template's own refs stay single.
        it('generate element file with forwarded inner ref from structural component in forEach (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-forwarded-ref-foreach';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Phase 3 — TWO structural instances of the same composite (a single `signupCard` and
        // a repeated `cards`) both embed the same inner `Counter`. The shared component-ref helpers
        // (`CounterRef` / `CounterRefs`) must each be declared EXACTLY ONCE at the file level — a
        // second declaration would be a duplicate-identifier TS error. Full toEqual locks the dedup.
        it('generate element file with forwarded inner refs from two structural instances of the same composite (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-forwarded-ref-multi';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Phase 3 refinement — a component INJECTED via `<override>` into a generic slot
        // composite forwards its ref carrying the OUTER (override authoring) scope, not the composite's
        // own ViewState (§C). The single instance re-bases to the page scope
        // (`CounterRef<PageWithOverrideForwardedRefViewState>`), the repeated one to the forEach item
        // (`CounterRefs<CardOfPageWithOverrideForwardedRefViewState>`); each injected `childComp` gets
        // the `(vs, _p1) => _p1` selector and its composite mount emits `__parentContext`. Full toEqual
        // locks the outer-scope type, the selector, and the parentContext plumbing together.
        it('generate element file with override-injected forwarded ref carrying the outer scope (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-override-forwarded-ref';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        // DL#193 Phase 3 (§4 validation) — a `forEach` inside a pure (Tier 2) structural composite
        // is rejected with a clear diagnostic: a pure component receives only scalar/enum props
        // (DL#187), so no array can ever drive an internal forEach. Assert the EXACT message.
        it('rejects a forEach inside a pure (Tier 2) structural composite (DL#193 Phase 3)', async () => {
            const folder = 'contracts/page-with-foreach-in-pure-composite';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([forEachInsidePureComponentError('card')]);
        });

        // DL#193 "Fix — empty-contract unwrap": an empty-contract headfull import (no props/tags,
        // no .ts) is unwrapped into the page body with no component boundary. A page-authored
        // override binding there is a current-scope binding, so the parent-scope pragma is stripped
        // on unwrap and `{itemName}` resolves as `vs.itemName` (no `_p1`), with no validations.
        it('generate element file with override binding on an unwrapped empty-contract import (DL#193)', async () => {
            const folder = 'contracts/page-with-override-unwrap-parent-binding';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('generate element file with headless component instance inside forEach', async () => {
            const folder = 'contracts/page-with-headless-in-foreach';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await prettify(
                    await readFixtureFileRaw(folder, 'page-with-headless-in-foreach.jay-html.ts'),
                ),
            );
        });

        it('generate element file with headless component instance with multiple children', async () => {
            const folder = 'contracts/page-with-headless-multi-child';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await prettify(
                    await readFixtureFileRaw(folder, 'page-with-headless-multi-child.jay-html.ts'),
                ),
            );
        });

        it('generate element file with linked contract with sub-contracts', async () => {
            const folder = 'contracts/page-using-named-counter';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await prettify(
                    await readFixtureFileRaw(folder, 'page-using-named-counter.jay-html.ts'),
                ),
            );
        });
    });

    describe('async rendering', () => {
        it('for async simple types', async () => {
            const folder = 'async/async-simple-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for async objects', async () => {
            const folder = 'async/async-objects';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for async arrays', async () => {
            const folder = 'async/async-arrays';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('recursive HTML', () => {
        it('simple tree with array recursion', async () => {
            const folder = 'recursive-html/simple-tree';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('indirect recursion through container', async () => {
            const folder = 'recursive-html/indirect-recursion';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('indirect recursion through container 2', async () => {
            const folder = 'recursive-html/indirect-recursion-2';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('nested btree with accessor recursion and with-data', async () => {
            const folder = 'recursive-html/nested-btree';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('tree with conditional recursion', async () => {
            const folder = 'recursive-html/tree-with-conditional';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('nested comments thread', async () => {
            const folder = 'recursive-html/nested-comments';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('linked list with single optional child', async () => {
            const folder = 'recursive-html/linked-list';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('binary tree with multiple optional children', async () => {
            const folder = 'recursive-html/binary-tree';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('should report error when nested recursion missing context switch', async () => {
            // Test that we catch when someone tries to access nested properties
            // without using <with-data> or forEach to switch context
            const folder = 'recursive-html/nested-without-context';
            const elementFile = await readFileAndGenerateElementFile(folder);

            // Should have validation errors
            expect(elementFile.validations.length).toBeGreaterThan(0);

            // Should report that 'name' property is not found in root ViewState
            // (because we're trying to access tree.name without switching context to tree)
            const nameError = elementFile.validations.find(
                (v) => v.includes('name') && v.includes('not found'),
            );
            expect(nameError).toBeDefined();
            expect(nameError).toContain('the data field [name] not found in Jay data');

            // Should also report that 'children' property is not found
            const childrenError = elementFile.validations.find(
                (v) => v.includes('children') && v.includes('not found'),
            );
            expect(childrenError).toBeDefined();
            expect(childrenError).toContain('the data field [children] not found in Jay data');
        });

        it('two with-data, conditions and refs', async () => {
            // Test that <with-data> at the root level generates proper code wrapped in de()
            const folder = 'recursive-html/two-with-data';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
        it('with-data at root of body', async () => {
            // Test that <with-data> at the root level generates proper code wrapped in de()
            const folder = 'recursive-html/with-data-at-root';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });
});
