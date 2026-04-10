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
// @ts-ignore
import { layout } from '/layout/layout';
function _headlessHeader1HydrateRender(options) {
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
const _HeadlessHeader1 = makeHeadlessInstanceComponent(
    _headlessHeader1HydrateRender,
    header,
    'header:AR0',
);
function _headlessLayout0HydrateRender(options) {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [
                childCompHydrate(
                    _HeadlessHeader1,
                    (vs) => ({ logoUrl: '/logo.png' }),
                    '0/header:AR0',
                    refAr0(),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessLayout0 = makeHeadlessInstanceComponent(
    _headlessLayout0HydrateRender,
    layout,
    'layout:AR0',
);
export function hydrate(rootElement, options) {
    const [refManager, [refAr02]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                childCompHydrate(_HeadlessLayout0, (vs) => ({}), '0/layout:AR0', refAr02()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
