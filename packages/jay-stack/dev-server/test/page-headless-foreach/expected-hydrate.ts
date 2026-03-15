import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    childComp,
    useContext,
    currentConstructionContext,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
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
        const instanceKey = (currentConstructionContext()?.dataIds ?? []).join(',') + ',widget:0';
        const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
        return ConstructContext.withHydrationChildContext(instanceVs, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.label),
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement()),
            ]),
        );
    };
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0Adopt = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget.comp,
    (dataIds) => dataIds.join(','),
    widget.contexts,
);
function _headlessWidget1Render(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'widget' }, [
                e('span', { class: 'label' }, [dt((vs) => vs.label)]),
                e('span', { class: 'value' }, [dt((vs) => vs.value)]),
                e('button', {}, ['+1'], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget1 = makeHeadlessInstanceComponent(
    _headlessWidget1Render,
    widget.comp,
    (dataIds) => [...dataIds, 'widget:0'].toString(),
    widget.contexts,
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                hydrateForEach(
                    '0',
                    (vs) => vs.items,
                    '_id',
                    () => [
                        childCompHydrate(
                            _HeadlessWidget0Adopt,
                            (vs1) => ({ itemId: vs1._id }),
                            'widget:0',
                            refAR1(),
                        ),
                    ],
                    (vs1) => {
                        return e('div', { class: 'list' }, [
                            childComp(_HeadlessWidget1, (vs12) => ({ itemId: vs12._id }), refAR1()),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
