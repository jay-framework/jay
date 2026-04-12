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
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs{{ROOT}}/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { header } from '/header/header';
function _headlessHeader0HydrateRender(options) {
    const [refManager, [refIncrement]] = ReferencesManager.for(options, ['increment'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S1/0', {}, [
                adoptText('S1/0/1', (vs) => vs.value),
                adoptElement('S1/0/2', {}, [], refIncrement()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessHeader0 = makeHeadlessInstanceComponent(
    _headlessHeader0HydrateRender,
    header,
    'S0/0/header:AR0',
);
function _headlessHeader0Render(options) {
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
const _HeadlessHeader0Create = makeHeadlessInstanceComponent(
    _headlessHeader0Render,
    header,
    'S0/0/header:AR0',
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
            adoptDynamicElement('S0/0', {}, [
                STATIC,
                hydrateConditional(
                    (vs) => vs.showWidget,
                    () =>
                        childCompHydrate(
                            _HeadlessHeader0,
                            (vs) => ({ itemId: '1' }),
                            'S1/0',
                            refAr0(),
                        ),
                    () => childComp(_HeadlessHeader0Create, (vs) => ({ itemId: '1' }), refAr0()),
                ),
                hydrateConditional(
                    (vs) => !vs.showWidget,
                    () => adoptElement('S0/0/1', {}, []),
                    () => e('p', {}, ['Widget hidden']),
                ),
                adoptElement('S0/0/2', {}, [], refToggleButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
