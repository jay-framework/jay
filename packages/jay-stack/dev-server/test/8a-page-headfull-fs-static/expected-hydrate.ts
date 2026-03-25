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
import { header } from '/header/header';
function _headlessHeader0HydrateRender(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.cartCount),
                adoptElement('0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessHeader0 = makeHeadlessInstanceComponent(
    _headlessHeader0HydrateRender,
    header,
    'header:AR0',
);
export function hydrate(rootElement, options) {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                childCompHydrate(
                    _HeadlessHeader0,
                    (vs) => ({ logoUrl: '/logo.png' }),
                    '0/header:AR0',
                    refAr0(),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
