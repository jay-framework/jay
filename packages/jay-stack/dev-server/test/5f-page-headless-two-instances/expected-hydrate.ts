import {
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    childCompHydrate,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs{{ROOT}}/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { widget } from '/widget';
function _headlessWidget0HydrateRender(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S1/0', {}, [
                adoptText('S1/0/1', (vs) => vs.value),
                adoptElement('S1/0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0 = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget,
    'S0/0/1/widget:AR0',
);
function _headlessWidget1HydrateRender(options) {
    const [refManager, [refIncrement2]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S2/0', {}, [
                adoptText('S2/0/1', (vs) => vs.value),
                adoptElement('S2/0/2', {}, [], refIncrement2()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget1 = makeHeadlessInstanceComponent(
    _headlessWidget1HydrateRender,
    widget,
    'S0/0/2/widget:AR1',
);
export function hydrate(rootElement, options) {
    const [refManager, [refAr0, refAr1]] = ReferencesManager.for(
        options,
        [],
        [],
        ['ar0', 'ar1'],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                childCompHydrate(_HeadlessWidget0, (vs) => ({ itemId: '1' }), 'S1/0', refAr0()),
                childCompHydrate(_HeadlessWidget1, (vs) => ({ itemId: '3' }), 'S2/0', refAr1()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
