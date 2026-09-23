import {
    element as e,
    dynamicAttribute as da,
    ReferencesManager,
    ConstructContext,
    adoptElement,
    childCompHydrate,
    hydrateConditional,
    adoptDynamicElement,
    classNames as cx,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makePassthroughHeadlessInstanceComponent } from '/@fs{{ROOT}}/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { Status } from './components/badge/badge.jay-contract';
export var CurrentStatus = /* @__PURE__ */ ((CurrentStatus2) => {
    CurrentStatus2[(CurrentStatus2['success'] = 0)] = 'success';
    CurrentStatus2[(CurrentStatus2['warning'] = 1)] = 'warning';
    CurrentStatus2[(CurrentStatus2['error'] = 2)] = 'error';
    return CurrentStatus2;
})(CurrentStatus || {});
function _headlessBadge0HydrateRender(options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptDynamicElement(
                'S1/0',
                {
                    class: da((vs) =>
                        cx(
                            'badge',
                            vs.status === Status.success ? 'badge--success' : '',
                            vs.status === Status.warning ? 'badge--warning' : '',
                            vs.status === Status.error ? 'badge--error' : '',
                        ),
                    ),
                },
                [
                    hydrateConditional(
                        (vs) => vs.status === Status.success,
                        () => adoptElement('S1/0/0', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--success' }, ['[OK]']),
                    ),
                    hydrateConditional(
                        (vs) => vs.status === Status.warning,
                        () => adoptElement('S1/0/1', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--warning' }, ['[!]']),
                    ),
                    hydrateConditional(
                        (vs) => vs.status === Status.error,
                        () => adoptElement('S1/0/2', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--error' }, ['[X]']),
                    ),
                    adoptElement('S1/0/3', {}, []),
                    adoptElement('S1/0/4', {}, []),
                    ...(viewState.featured ? [adoptElement('S1/0/5', {}, [])] : []),
                ],
            ),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessBadge0 = makePassthroughHeadlessInstanceComponent(
    _headlessBadge0HydrateRender,
    'S0/0/badge:AR0',
);
function _headlessBadge1HydrateRender(options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptDynamicElement(
                'S2/0',
                {
                    class: da((vs) =>
                        cx(
                            'badge',
                            vs.status === Status.success ? 'badge--success' : '',
                            vs.status === Status.warning ? 'badge--warning' : '',
                            vs.status === Status.error ? 'badge--error' : '',
                        ),
                    ),
                },
                [
                    hydrateConditional(
                        (vs) => vs.status === Status.success,
                        () => adoptElement('S2/0/0', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--success' }, ['[OK]']),
                    ),
                    hydrateConditional(
                        (vs) => vs.status === Status.warning,
                        () => adoptElement('S2/0/1', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--warning' }, ['[!]']),
                    ),
                    hydrateConditional(
                        (vs) => vs.status === Status.error,
                        () => adoptElement('S2/0/2', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--error' }, ['[X]']),
                    ),
                    adoptElement('S2/0/3', {}, []),
                    adoptElement('S2/0/4', {}, []),
                    ...(viewState.featured ? [adoptElement('S2/0/5', {}, [])] : []),
                ],
            ),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessBadge1 = makePassthroughHeadlessInstanceComponent(
    _headlessBadge1HydrateRender,
    'S0/0/badge:AR1',
);
export function hydrate(rootElement, options) {
    const [refManager, [refCycleButton, refAr0, refAr1]] = ReferencesManager.for(
        options,
        ['cycleButton'],
        [],
        ['ar0', 'ar1'],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                childCompHydrate(
                    _HeadlessBadge0,
                    (vs) => ({
                        label: 'Live Status',
                        status: Status.success,
                        count: 42,
                        featured: true,
                    }),
                    'S1/0',
                    refAr0(),
                ),
                childCompHydrate(
                    _HeadlessBadge1,
                    (vs) => ({
                        label: 'Dynamic Status',
                        status: vs.currentStatus,
                        count: vs.liveCount,
                        featured: false,
                    }),
                    'S2/0',
                    refAr1(),
                ),
                adoptElement('S0/0/1', {}, [], refCycleButton()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
