import {
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    adoptText,
    adoptElement,
    childCompHydrate,
    // @ts-ignore
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs/Users/yoav/work/jay/main/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { widget } from '/widget';
function _headlessWidget0HydrateRender(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0 = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget,
    '1/widget:AR0',
);
function _headlessWidget1HydrateRender(options) {
    const [refManager, [refIncrement2]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement2()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget1 = makeHeadlessInstanceComponent(
    _headlessWidget1HydrateRender,
    widget,
    '2/0/widget:AR0',
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                slowForEachItem(
                    (vs) => vs.items,
                    0,
                    '1',
                    () =>
                        childCompHydrate(
                            _HeadlessWidget0,
                            (vs1) => ({ itemId: '1' }),
                            'widget:AR0',
                            refAr0(),
                        ),
                ),
                slowForEachItem(
                    (vs) => vs.items,
                    1,
                    '2',
                    () =>
                        childCompHydrate(
                            _HeadlessWidget1,
                            (vs1) => ({ itemId: '2' }),
                            '0/widget:AR0',
                            refAr0(),
                        ),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
