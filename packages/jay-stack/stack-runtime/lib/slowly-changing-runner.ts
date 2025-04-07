import {
    AnyJayStackComponentDefinition,
    AnySlowlyRenderResult,
    JayStackComponentDefinition,
    PageProps,
} from './jay-stack-types';
import { JayComponentCore } from 'jay-component';
import { UrlParams } from './jay-stack-types';
import { notFound, partialRender } from './render-results';

export interface SlowlyChangingPhase {
    runSlowlyForPage(
        componentDefinition: AnyJayStackComponentDefinition,
        pageParams: object,
        pageProps: PageProps,
    ): Promise<AnySlowlyRenderResult>;
}

function urlParamsKey(params: UrlParams) {
    return Object.keys(params)
        .sort()
        .reduce((prev, curr) => `${prev}${curr}=${params[curr]}&`, '');
}

function equalParams(aPageParams: UrlParams, pageParams: UrlParams) {
    return urlParamsKey(aPageParams) === urlParamsKey(pageParams);
}

export class DevSlowlyChangingPhase implements SlowlyChangingPhase {
    async runSlowlyForPage(
        componentDefinition: AnyJayStackComponentDefinition,
        pageParams: UrlParams,
        pageProps: PageProps,
    ): Promise<AnySlowlyRenderResult> {
        if (componentDefinition.loadParams) {
            const pagesParams = await componentDefinition.loadParams([]);
            for (const aPageParams of pagesParams) {
                if (equalParams(aPageParams, pageParams)) {
                    if (componentDefinition.slowlyRender)
                        return componentDefinition.slowlyRender(
                            { ...pageProps, ...pageParams },
                            [],
                        );
                    else return partialRender({}, {});
                }
            }
            return notFound();
        } else if (componentDefinition.slowlyRender)
            return componentDefinition.slowlyRender({ ...pageProps, ...pageParams }, []);
        else return partialRender({}, {});
    }
}

export async function runLoadParams<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    compDefinition: JayStackComponentDefinition<
        StaticViewState,
        ViewState,
        Refs,
        ServerContexts,
        ClientContexts,
        PropsT,
        Params,
        CarryForward,
        CompCore
    >,
    serverContexts: ServerContexts,
) {
    compDefinition.loadParams(serverContexts);
}

export function runSlowlyChangingRender<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    compDefinition: JayStackComponentDefinition<
        StaticViewState,
        ViewState,
        Refs,
        ServerContexts,
        ClientContexts,
        PropsT,
        Params,
        CarryForward,
        CompCore
    >,
) {}
