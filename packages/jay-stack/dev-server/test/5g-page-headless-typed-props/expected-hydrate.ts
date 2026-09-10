import {
    element as e,
    ReferencesManager,
    ConstructContext,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateConditional,
    adoptDynamicElement,
// @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs{{ROOT}}/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { Status } from '/widget.jay-contract';
// @ts-ignore
import { widget } from '/widget';
export var ReqStatus = /* @__PURE__ */ ((ReqStatus2) => {
    ReqStatus2[(ReqStatus2['success'] = 0)] = 'success';
    ReqStatus2[(ReqStatus2['warning'] = 1)] = 'warning';
    ReqStatus2[(ReqStatus2['error'] = 2)] = 'error';
    return ReqStatus2;
})(ReqStatus || {});
function _headlessWidget0HydrateRender(options) {
    const [refManager, [refBump]] = ReferencesManager.for(options, ['bump'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptDynamicElement('S1/0', {}, [
                hydrateConditional(
                    (vs) => vs.status === Status.success,
                    () => adoptElement('S1/0/0', {}, []),
                    () => e('span', { class: 'icon-ok' }, ['[OK]']),
                ),
                hydrateConditional(
                    (vs) => vs.status === Status.warning,
                    () => adoptElement('S1/0/1', {}, []),
                    () => e('span', { class: 'icon-warn' }, ['[!]']),
                ),
                hydrateConditional(
                    (vs) => vs.status === Status.error,
                    () => adoptElement('S1/0/2', {}, []),
                    () => e('span', { class: 'icon-err' }, ['[X]']),
                ),
                adoptElement('S1/0/3', {}, []),
                adoptText('S1/0/4', (vs) => `Count: ${vs.count}`),
                ...(viewState.active ? [adoptElement('S1/0/5', {}, [])] : []),
                adoptElement('S1/0/6', {}, [], refBump()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget0 = makeHeadlessInstanceComponent(
    _headlessWidget0HydrateRender,
    widget,
    'S0/0/widget:AR0',
);
function _headlessWidget1HydrateRender(options) {
    const [refManager, [refBump2]] = ReferencesManager.for(options, ['bump'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptDynamicElement('S2/0', {}, [
                hydrateConditional(
                    (vs) => vs.status === Status.success,
                    () => adoptElement('S2/0/0', {}, []),
                    () => e('span', { class: 'icon-ok' }, ['[OK]']),
                ),
                hydrateConditional(
                    (vs) => vs.status === Status.warning,
                    () => adoptElement('S2/0/1', {}, []),
                    () => e('span', { class: 'icon-warn' }, ['[!]']),
                ),
                hydrateConditional(
                    (vs) => vs.status === Status.error,
                    () => adoptElement('S2/0/2', {}, []),
                    () => e('span', { class: 'icon-err' }, ['[X]']),
                ),
                adoptElement('S2/0/3', {}, []),
                adoptText('S2/0/4', (vs) => `Count: ${vs.count}`),
                ...(viewState.active ? [adoptElement('S2/0/5', {}, [])] : []),
                adoptElement('S2/0/6', {}, [], refBump2()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessWidget1 = makeHeadlessInstanceComponent(
    _headlessWidget1HydrateRender,
    widget,
    'S0/0/widget:AR1',
);
export function hydrate(rootElement, options) {
    const [refManager, [refAr0, refAr1]] = ReferencesManager.for(
        options,
        [],
        [],
        ['ar0', 'ar1'],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                childCompHydrate(
                    _HeadlessWidget0,
                    (vs) => ({ itemId: 'A', status: Status.warning, count: 5, active: false }),
                    'S1/0',
                    refAr0(),
                ),
                childCompHydrate(
                    _HeadlessWidget1,
                    (vs) => ({
                        itemId: 'B',
                        status: vs.reqStatus,
                        count: vs.reqCount,
                        active: vs.reqActive,
                    }),
                    'S2/0',
                    refAr1(),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
