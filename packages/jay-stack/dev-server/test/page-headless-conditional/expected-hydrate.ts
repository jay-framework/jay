import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    ConstructContext,
    childComp,
    useContext,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateConditional,
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
        const instanceKey = 'widget:0';
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
    widget,
    'widget:0',
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
    'widget:0',
);
export function hydrate(rootElement, options) {
    const [refManager, [refToggleButton, ref_0]] = ReferencesManager.for(
        options,
        ['toggleButton'],
        [],
        ['0'],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                hydrateConditional(
                    (vs) => vs.showWidget,
                    () =>
                        childCompHydrate(
                            _HeadlessWidget0,
                            (vs) => ({ itemId: '1' }),
                            '0/widget:0',
                            ref_0(),
                        ),
                    () => childComp(_HeadlessWidget0Create, (vs) => ({ itemId: '1' }), ref_0()),
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
