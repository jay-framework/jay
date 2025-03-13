import {AnyFastRenderResult, AnyJayStackComponentDefinition, PageProps} from "./jay-stack-types";

export function renderFastChangingData(componentDefinition: AnyJayStackComponentDefinition,
                                       pageParams: object,
                                       pageProps: PageProps,
                                       carryForward: object):
    Promise<AnyFastRenderResult> {
    return componentDefinition.fastRender({...pageParams, ...pageProps, ...carryForward});
}
