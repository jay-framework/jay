import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    childComp,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
    adoptDynamicElement,
// @ts-ignore
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs/Users/yoav/work/jay/main/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { widget } from '/widget.ts';
function _headlessWidget0HydrateRender(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.label),
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0Adopt = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget,
    (dataIds) => [...dataIds, 'widget:0'].toString(),
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
const _HeadlessWidget1 = makeHeadlessInstanceComponent(_headlessWidget1Render, widget, (dataIds) =>
    [...dataIds, 'widget:0'].toString(),
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [refManager, [refAddButton, refRemoveButton]] = ReferencesManager.for(
        options,
        ['addButton', 'removeButton'],
        [],
        [],
        [],
        {
            items: itemsRefManager,
        },
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                hydrateForEach(
                    (vs) => vs.items,
                    '_id',
                    () => [
                        adoptText('0/0', (vs1) => vs1.name),
                        childCompHydrate(
                            _HeadlessWidget0Adopt,
                            (vs1) => ({ itemId: vs1._id }),
                            '0/widget:0',
                            refAR1(),
                        ),
                    ],
                    (vs1) => {
                        return e('div', { class: 'list' }, [
                            e('div', { class: 'card' }, [
                                e('strong', {}, [dt((vs12) => vs12.name)]),
                                childComp(
                                    _HeadlessWidget1,
                                    (vs12) => ({ itemId: vs12._id }),
                                    refAR1(),
                                ),
                            ]),
                        ]);
                    },
                ),
                adoptElement('0/2', {}, [], refAddButton()),
                adoptElement('0/3', {}, [], refRemoveButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
