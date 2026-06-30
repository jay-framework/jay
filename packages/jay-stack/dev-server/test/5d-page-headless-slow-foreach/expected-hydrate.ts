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
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs{{ROOT}}/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { widget } from '/widget';
function _headlessWidget0HydrateRender(options) {
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
const _HeadlessWidget0Adopt = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget,
    (dataIds) => [...dataIds, 'widget:AR0'].toString(),
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
    [...dataIds, 'widget:AR0'].toString(),
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptElement('S0/0/0', {}, []),
                hydrateForEach(
                    (vs) => vs.items,
                    '_id',
                    'S0/0/1',
                    () => [
                        childCompHydrate(
                            _HeadlessWidget0Adopt,
                            (vs1) => ({ itemId: vs1._id }),
                            'S2/0',
                            refAr0(),
                        ),
                    ],
                    (vs1) => {
                        return e('div', { class: 'list' }, [
                            childComp(_HeadlessWidget1, (vs12) => ({ itemId: vs12._id }), refAr0()),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
