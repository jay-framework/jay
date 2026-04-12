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
    STATIC,
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
                adoptText('S2/0/0', (vs) => vs.label),
                adoptText('S2/0/1', (vs) => vs.value),
                adoptElement('S2/0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessHeader0Adopt = makeHeadlessInstanceComponent(
    _headlessHeader0HydrateRender,
    header,
    (dataIds) => [...dataIds, 'header:AR0'].toString(),
);
function _headlessHeader1Render(options) {
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
const _HeadlessHeader1 = makeHeadlessInstanceComponent(_headlessHeader1Render, header, (dataIds) =>
    [...dataIds, 'header:AR0'].toString(),
);
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [refManager, [refAddButton]] = ReferencesManager.for(options, ['addButton'], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptDynamicElement('S0/0/2', {}, [
                    STATIC,
                    hydrateForEach(
                        (vs) => vs.items,
                        '_id',
                        'S0/0/2/1',
                        () => [
                            adoptText('S1/0/0', (vs1) => vs1.name),
                            childCompHydrate(
                                _HeadlessHeader0Adopt,
                                (vs1) => ({ itemId: vs1._id }),
                                'S2/0',
                                refAr0(),
                            ),
                        ],
                        (vs1) => {
                            return e('div', {}, [
                                e('div', { class: 'card' }, [
                                    e('strong', {}, [dt((vs12) => vs12.name)]),
                                    childComp(
                                        _HeadlessHeader1,
                                        (vs12) => ({ itemId: vs12._id }),
                                        refAr0(),
                                    ),
                                ]),
                            ]);
                        },
                    ),
                ]),
                adoptElement('S0/0/3', {}, [], refAddButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
