import {
    AnyJayStackComponentDefinition,
    AnySlowlyRenderResult,
    JayStackComponentDefinition,
    PageProps,
} from './jay-stack-types';
import { JayComponentCore } from 'jay-component';
import { UrlParams } from './jay-stack-types';
import { notFound, partialRender } from './render-results';
import { CompositePart } from './composite-part';

export interface SlowlyChangingPhase {
    runSlowlyForPage(
        pageParams: object,
        pageProps: PageProps,
        parts: Array<CompositePart>,
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

function isLeftSideParamsSubsetOfRightSideParams(left: UrlParams, right: UrlParams): boolean {
    return Object.keys(left).reduce((prev, curr) => prev && left[curr] === right[curr], true);
}

async function findMatchingParams(
    search: UrlParams,
    searchTarget: AsyncIterable<UrlParams[]>,
): Promise<boolean> {
    for await (const paramsArray of searchTarget) {
        if (paramsArray.find((params) => isLeftSideParamsSubsetOfRightSideParams(search, params)))
            return true;
    }
    return false;
}

export class DevSlowlyChangingPhase implements SlowlyChangingPhase {
    async runSlowlyForPage(
        pageParams: UrlParams,
        pageProps: PageProps,
        parts: Array<CompositePart>,
    ): Promise<AnySlowlyRenderResult> {
        for (const part of parts) {
            const { compDefinition } = part;
            if (compDefinition.loadParams) {
                const compParams = compDefinition.loadParams([]);
                if (!(await findMatchingParams(pageParams, compParams))) return notFound();
            }
        }

        let slowlyViewState = {};
        let carryForward = {};
        for (const part of parts) {
            const { compDefinition, key } = part;
            const slowlyRenderedPart = await compDefinition.slowlyRender(
                { ...pageProps, ...pageParams },
                [],
            );
            if (slowlyRenderedPart.kind === 'PartialRender') {
                if (!key) {
                    slowlyViewState = { ...slowlyViewState, ...slowlyRenderedPart.rendered };
                    carryForward = { ...carryForward, ...slowlyRenderedPart.carryForward };
                } else {
                    slowlyViewState[key] = slowlyRenderedPart.rendered;
                    carryForward[key] = slowlyRenderedPart.carryForward;
                }
            } else return slowlyRenderedPart;
        }
        return partialRender(slowlyViewState, carryForward);
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
        CompCore
    >,
) {}
