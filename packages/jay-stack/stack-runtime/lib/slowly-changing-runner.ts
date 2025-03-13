import {JayStackComponentDefinition, PageProps, PartialRender, SlowlyRenderResult} from "./jay-stack-types";
import {JayComponentCore} from "jay-component";
import {UrlParams} from "./jay-stack-types";
import {notFound} from "./render-results";

export type AnyJayStackComponentDefinition = JayStackComponentDefinition<object, object, object, object[], object[], object, UrlParams, Object, any>
export type AnySlowlyRenderResult = SlowlyRenderResult<object, object>

export interface SlowlyChangingPhase {
    runSlowlyForPage(componentDefinition: AnyJayStackComponentDefinition, pageParams: object, pageProps: PageProps):
        Promise<AnySlowlyRenderResult>
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
    async runSlowlyForPage(componentDefinition: AnyJayStackComponentDefinition, pageParams: UrlParams, pageProps: PageProps):
        Promise<AnySlowlyRenderResult> {
        const pagesParams = await componentDefinition.loadParams([])
        for (const aPageParams of pagesParams) {
            if (equalParams(aPageParams, pageParams)) {
                return componentDefinition.slowlyRender({...pageProps, ...pageParams}, [])
            }
        }
        return notFound();
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
    CompCore extends JayComponentCore<PropsT, ViewState>
>(compDefinition: JayStackComponentDefinition<StaticViewState, ViewState, Refs, ServerContexts, ClientContexts, PropsT, Params, CarryForward, CompCore>,
  serverContexts: ServerContexts) {
    compDefinition.loadParams(serverContexts)
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
    CompCore extends JayComponentCore<PropsT, ViewState>
>(compDefinition: JayStackComponentDefinition<StaticViewState, ViewState, Refs, ServerContexts, ClientContexts, PropsT, Params, CarryForward, CompCore>) {

}