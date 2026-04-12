import {
    ReferencesManager,
    slowForEachItem,
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
            adoptElement('S2/0', {}, [
                adoptText('S2/0/1', (vs) => vs.value),
                adoptElement('S2/0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessHeader0 = makeHeadlessInstanceComponent(
    _headlessHeader0HydrateRender,
    header,
    'S1/0/header:AR0',
);
function _headlessHeader1HydrateRender(options) {
    const [refManager, [refIncrement2]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S4/0', {}, [
                adoptText('S4/0/1', (vs) => vs.value),
                adoptElement('S4/0/2', {}, [], refIncrement2()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessHeader1 = makeHeadlessInstanceComponent(
    _headlessHeader1HydrateRender,
    header,
    'S3/0/header:AR0',
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                slowForEachItem(
                    (vs) => vs.items,
                    0,
                    '1',
                    () =>
                        childCompHydrate(
                            _HeadlessHeader0,
                            (vs1) => ({ itemId: '1' }),
                            'S2/0',
                            refAr0(),
                        ),
                ),
                slowForEachItem(
                    (vs) => vs.items,
                    1,
                    '2',
                    () =>
                        childCompHydrate(
                            _HeadlessHeader1,
                            (vs1) => ({ itemId: '2' }),
                            'S4/0',
                            refAr0(),
                        ),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
