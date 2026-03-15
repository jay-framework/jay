import {
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    useContext,
    adoptText,
    adoptElement,
    childCompHydrate,
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
import {
    makeHeadlessInstanceComponent,
    HEADLESS_INSTANCES,
} from '/@fs/Users/yoav/work/jay/main/packages/jay-stack/stack-client-runtime/dist/index.js';
import { widget } from '/widget.ts';
function _headlessWidget0HydrateRender(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) => {
        const instanceData = useContext(HEADLESS_INSTANCES);
        const instanceKey = '1/widget:0';
        const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
        return ConstructContext.withHydrationChildContext(instanceVs, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement()),
            ]),
        );
    };
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0 = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget.comp,
    '1/widget:0',
    widget.contexts,
);
function _headlessWidget1HydrateRender(options) {
    const [refManager, [refIncrement2]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) => {
        const instanceData = useContext(HEADLESS_INSTANCES);
        const instanceKey = '2/widget:0';
        const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
        return ConstructContext.withHydrationChildContext(instanceVs, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement2()),
            ]),
        );
    };
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget1 = makeHeadlessInstanceComponent(
    _headlessWidget1HydrateRender,
    widget.comp,
    '2/widget:0',
    widget.contexts,
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [ref_0]] = ReferencesManager.for(options, [], [], [], ['0']);
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
                            'widget:0',
                            ref_0(),
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
                            'widget:0',
                            ref_0(),
                        ),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
