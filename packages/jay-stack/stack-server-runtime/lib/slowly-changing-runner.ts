import {
    AnySlowlyRenderResult,
    JayStackComponentDefinition,
    PageProps,
    UrlParams,
    notFound,
    partialRender,
} from '@jay-framework/fullstack-component';
import { JayComponentCore } from '@jay-framework/component';
import { DevServerPagePart } from './load-page-parts';
import { resolveServices } from './services';

export interface SlowlyChangingPhase {
    runSlowlyForPage(
        pageParams: object,
        pageProps: PageProps,
        parts: Array<DevServerPagePart>,
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
    constructor(private dontCacheSlowly: boolean) {}

    async runSlowlyForPage(
        pageParams: UrlParams,
        pageProps: PageProps,
        parts: Array<DevServerPagePart>,
    ): Promise<AnySlowlyRenderResult> {
        for (const part of parts) {
            const { compDefinition, contractInfo } = part;
            if (compDefinition.loadParams) {
                // Resolve services from registry
                const services = resolveServices(compDefinition.services);

                // For dynamic contracts, append contract info to services
                // Components expecting contract info should declare it as last service
                const loadParamsArgs = contractInfo
                    ? [...services, { contractName: contractInfo.contractName, contract: contractInfo.contract }]
                    : services;

                const compParams = compDefinition.loadParams(loadParamsArgs);
                if (!(await findMatchingParams(pageParams, compParams))) return notFound();
            }
        }

        let slowlyViewState = {};
        let carryForward = {};
        for (const part of parts) {
            const { compDefinition, key, contractInfo } = part;
            if (compDefinition.slowlyRender) {
                // Resolve services from registry
                const services = resolveServices(compDefinition.services);

                // Build props with contract info if available (for dynamic contracts)
                const partProps = {
                    ...pageProps,
                    ...pageParams,
                    ...(contractInfo && {
                        contractName: contractInfo.contractName,
                        contract: contractInfo.contract,
                    }),
                };

                const slowlyRenderedPart = await compDefinition.slowlyRender(
                    partProps,
                    ...services,
                );
                if (slowlyRenderedPart.kind === 'PhaseOutput') {
                    if (!key) {
                        slowlyViewState = { ...slowlyViewState, ...slowlyRenderedPart.rendered };
                        carryForward = { ...carryForward, ...slowlyRenderedPart.carryForward };
                    } else {
                        slowlyViewState[key] = slowlyRenderedPart.rendered;
                        carryForward[key] = slowlyRenderedPart.carryForward;
                    }
                } else return slowlyRenderedPart;
            }
        }
        return partialRender(slowlyViewState, carryForward);
    }
}

export async function runLoadParams<
    Refs extends object,
    SlowVS extends object,
    FastVS extends object,
    InteractiveVS extends object,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, InteractiveVS>,
>(
    compDefinition: JayStackComponentDefinition<
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        Contexts,
        PropsT,
        Params,
        CompCore
    >,
    services: Services,
) {
    compDefinition.loadParams(services);
}

export function runSlowlyChangingRender<
    Refs extends object,
    SlowVS extends object,
    FastVS extends object,
    InteractiveVS extends object,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, InteractiveVS>,
>(
    compDefinition: JayStackComponentDefinition<
        Refs,
        SlowVS,
        FastVS,
        InteractiveVS,
        Services,
        Contexts,
        PropsT,
        Params,
        CompCore
    >,
) {}
