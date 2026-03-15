import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    adoptText,
    hydrateForEach,
    adoptDynamicElement,
    // @ts-ignore
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                hydrateForEach(
                    (vs) => vs.products,
                    '_id',
                    () => [
                        adoptText('$_id/0/0', (vs1) => vs1.name),
                        adoptText('$_id/0/1', (vs1) => vs1.price),
                    ],
                    (vs1) => {
                        return e('div', { class: 'grid' }, [
                            e('div', { class: 'card' }, [
                                e('h2', {}, [dt((vs12) => vs12.name)]),
                                e('span', {}, [dt((vs12) => vs12.price)]),
                            ]),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
