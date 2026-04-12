import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    adoptText,
    hydrateForEach,
    adoptDynamicElement,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                hydrateForEach(
                    (vs) => vs.groups,
                    '_id',
                    'S0/0/1',
                    () => [
                        adoptDynamicElement('S0/0/1', {}, [
                            adoptText('S1/0', (vs1) => vs1.name),
                            hydrateForEach(
                                (vs1) => vs1.items,
                                '_id',
                                'S1/1',
                                () => [adoptText('S2/0', (vs2) => vs2.label)],
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                            ),
                        ]),
                    ],
                    (vs1) => {
                        return de('div', { class: 'group' }, [
                            e('h2', {}, [dt((vs12) => vs12.name)]),
                            forEach(
                                (vs12) => vs12.items,
                                (vs2) => {
                                    return e('ul', {}, [e('li', {}, [dt((vs22) => vs22.label)])]);
                                },
                                '_id',
                            ),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
