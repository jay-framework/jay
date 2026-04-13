import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    adoptText,
    adoptElement,
    hydrateConditional,
    hydrateForEach,
    adoptDynamicElement,
// @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refChoiceButton]] = ReferencesManager.for(
        options,
        [],
        ['choiceButton'],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                hydrateForEach(
                    (vs) => vs.items,
                    '_id',
                    'S0/0/1',
                    () => [
                        adoptDynamicElement('S0/0/1', {}, [
                            hydrateConditional(
                                (vs1) => !vs1.inStock,
                                () =>
                                    adoptElement(
                                        'S1/0',
                                        {},
                                        [adoptText('S1/0', (vs1) => ` ${vs1.name} `)],
                                        refChoiceButton(),
                                    ),
                                () =>
                                    e(
                                        'button',
                                        { class: 'choice out-of-stock' },
                                        [dt((vs1) => ` ${vs1.name} `)],
                                        refChoiceButton(),
                                    ),
                            ),
                            hydrateConditional(
                                (vs1) => vs1.inStock,
                                () =>
                                    adoptElement(
                                        'S1/1',
                                        {},
                                        [adoptText('S1/1', (vs1) => ` ${vs1.name} `)],
                                        refChoiceButton(),
                                    ),
                                () =>
                                    e(
                                        'button',
                                        { class: 'choice' },
                                        [dt((vs1) => ` ${vs1.name} `)],
                                        refChoiceButton(),
                                    ),
                            ),
                        ]),
                    ],
                    (vs1) => {
                        return de('div', { class: 'item' }, [
                            c(
                                (vs12) => !vs12.inStock,
                                () =>
                                    e(
                                        'button',
                                        { class: 'choice out-of-stock' },
                                        [dt((vs12) => ` ${vs12.name} `)],
                                        refChoiceButton(),
                                    ),
                            ),
                            c(
                                (vs12) => vs12.inStock,
                                () =>
                                    e(
                                        'button',
                                        { class: 'choice' },
                                        [dt((vs12) => ` ${vs12.name} `)],
                                        refChoiceButton(),
                                    ),
                            ),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
