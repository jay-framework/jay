import {
    dynamicAttribute as da,
    ReferencesManager,
    ConstructContext,
    adoptElement,
    childCompHydrate,
    // @ts-ignore
} from '/@fs{{ROOT}}/packages/runtime/runtime/dist/index.js';
// @ts-ignore
import { makeHeadlessInstanceComponent } from '/@fs{{ROOT}}/packages/jay-stack/stack-client-runtime/dist/index.js';
// @ts-ignore
import { spotlight } from '/spotlight';
function _headlessSpotlight0HydrateRender(options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S1/0', {}, [
                adoptElement(
                    'S1/0/2',
                    { src: da((vs) => vs.product?.imageUrl), alt: da((vs) => vs.product?.name) },
                    [],
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
const _HeadlessSpotlight0 = makeHeadlessInstanceComponent(
    _headlessSpotlight0HydrateRender,
    spotlight,
    'S0/0/spotlight:AR0',
);
export function hydrate(rootElement, options) {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                childCompHydrate(_HeadlessSpotlight0, (vs) => ({ slug: 'vase' }), 'S1/0', refAr0()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
