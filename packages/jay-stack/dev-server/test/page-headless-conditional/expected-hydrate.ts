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
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) => {
        const instanceData = useContext(HEADLESS_INSTANCES);
        const instanceKey = 'widget:0';
        const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
        return ConstructContext.withHydrationChildContext(instanceVs, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.label),
                adoptText('0/1', (vs) => vs.value),
            ]),
        );
    };
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0 = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget.comp,
    '0/widget:0',
    widget.contexts,
);
function _headlessWidget0Render(options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'widget' }, [
                e('span', { class: 'label' }, [dt((vs) => vs.label)]),
                e('span', { class: 'value' }, [dt((vs) => vs.value)]),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0Create = makeHeadlessInstanceComponent(
    _headlessWidget0Render,
    widget.comp,
    'widget:0',
    widget.contexts,
);
export function hydrate(rootElement, options) {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                hydrateConditional(
                    (vs) => vs.showWidget,
                    () =>
                        childCompHydrate(
                            _HeadlessWidget0,
                            (vs) => ({ itemId: '1' }),
                            '0/widget:0',
                            refAR1(),
                        ),
                    () => childComp(_HeadlessWidget0Create, (vs) => ({ itemId: '1' }), refAR1()),
                ),
                hydrateConditional(
                    (vs) => !vs.showWidget,
                    () => adoptElement('0/1', {}, []),
                    () => e('p', {}, ['Widget hidden']),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
