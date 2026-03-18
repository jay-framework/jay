import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    childComp,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateConditional,
    adoptDynamicElement,
    STATIC,
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
                adoptText('0/1', (vs) => vs.value),
                adoptElement('0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0 = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget,
    'widget:AR0',
);
function _headlessWidget0Render(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'widget' }, [
                e('span', { class: 'label' }, ['Item 1']),
                e('span', { class: 'value' }, [dt((vs) => vs.value)]),
                e('button', {}, ['+1'], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0Create = makeHeadlessInstanceComponent(
    _headlessWidget0Render,
    widget,
    'widget:AR0',
);
export function hydrate(rootElement, options) {
    const [refManager, [refToggleButton, refAr0]] = ReferencesManager.for(
        options,
        ['toggleButton'],
        [],
        ['ar0'],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                STATIC,
                hydrateConditional(
                    (vs) => vs.showWidget,
                    () =>
                        childCompHydrate(
                            _HeadlessWidget0,
                            (vs) => ({ itemId: '1' }),
                            '0/widget:AR0',
                            refAr0(),
                        ),
                    () => childComp(_HeadlessWidget0Create, (vs) => ({ itemId: '1' }), refAr0()),
                ),
                hydrateConditional(
                    (vs) => !vs.showWidget,
                    () => adoptElement('0/1', {}, []),
                    () => e('p', {}, ['Widget hidden']),
                ),
                adoptElement('0/2', {}, [], refToggleButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
