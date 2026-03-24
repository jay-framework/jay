import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
    STATIC,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [statusRefManager, [refIncrement]] = ReferencesManager.for(
        options,
        ['increment'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        status: statusRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                STATIC,
                hydrateConditional(
                    (vs) => vs.status?.showBanner,
                    () =>
                        adoptElement('0/1', {}, [
                            adoptText('0/1/0', (vs) => vs.status?.bannerText),
                        ]),
                    () =>
                        e('div', { class: 'banner' }, [
                            e('span', { class: 'banner-text' }, [
                                dt((vs) => vs.status?.bannerText),
                            ]),
                        ]),
                ),
                adoptText('0/2', (vs) => `Count: ${vs.status?.counter}`),
                adoptElement('0/3', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
