import {
    element as e,
    ReferencesManager,
    ConstructContext,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
    STATIC,
// @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, [refToggleButton]] = ReferencesManager.for(
        options,
        ['toggleButton'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                STATIC,
                STATIC,
                STATIC,
                STATIC,
                hydrateConditional(
                    (vs) => vs.interactiveVisible,
                    () => adoptElement('0/4', {}, []),
                    () => e('span', { class: 'interactive-true' }, ['Interactive Visible']),
                ),
                hydrateConditional(
                    (vs) => vs.interactiveHidden,
                    () => adoptElement('0/5', {}, []),
                    () => e('span', { class: 'interactive-hidden' }, ['Interactive Hidden']),
                ),
                hydrateConditional(
                    (vs) => vs.interactiveVisible,
                    () => adoptElement('0/6', {}, []),
                    () => e('span', { class: 'mixed' }, ['Mixed']),
                ),
                adoptElement('0/7', {}, [], refToggleButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
