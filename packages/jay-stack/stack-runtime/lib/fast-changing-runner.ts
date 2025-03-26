import { AnyFastRenderResult, AnyJayStackComponentDefinition, PageProps } from './jay-stack-types';
import { partialRender } from './render-results';

export function renderFastChangingData(
    componentDefinition: AnyJayStackComponentDefinition,
    pageParams: object,
    pageProps: PageProps,
    carryForward: object,
): Promise<AnyFastRenderResult> {
    if (componentDefinition.fastRender)
        return componentDefinition.fastRender({ ...pageParams, ...pageProps, ...carryForward });
    else return Promise.resolve(partialRender({}, {}));
}
