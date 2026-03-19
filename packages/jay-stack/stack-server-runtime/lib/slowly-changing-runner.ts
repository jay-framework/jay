import {
    AnySlowlyRenderResult,
    JayStackComponentDefinition,
    PageProps,
    UrlParams,
    notFound,
    partialRender,
} from '@jay-framework/fullstack-component';
import { JayComponentCore } from '@jay-framework/component';
import { DevServerPagePart, HeadlessInstanceComponent } from './load-page-parts';
import { resolveServices } from './services';
import type { DiscoveredHeadlessInstance } from '@jay-framework/compiler-jay-html';
import type { InstancePhaseData, InstanceSlowRenderResult } from './instance-slow-render';

export interface SlowlyChangingPhase {
    runSlowlyForPage(
        pageParams: object,
        pageProps: PageProps,
        parts: Array<DevServerPagePart>,
        discoveredInstances?: DiscoveredHeadlessInstance[],
        headlessInstanceComponents?: HeadlessInstanceComponent[],
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
        parts: Array<DevServerPagePart>,
        discoveredInstances?: DiscoveredHeadlessInstance[],
        headlessInstanceComponents?: HeadlessInstanceComponent[],
    ): Promise<AnySlowlyRenderResult> {
        for (const part of parts) {
            const { compDefinition, contractInfo } = part;
            if (compDefinition.loadParams) {
                // Resolve services from registry
                const services = resolveServices(compDefinition.services);

                // For dynamic contracts, append contract info to services
                // Components expecting contract info should declare it as last service
                const loadParamsArgs = contractInfo
                    ? [
                          ...services,
                          {
                              contractName: contractInfo.contractName,
                              metadata: contractInfo.metadata,
                          },
                      ]
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
                        metadata: contractInfo.metadata,
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
        // Run slow render for discovered headless instances (DL#109).
        // All discovered instances are included in instancePhaseData — even those
        // without slowlyRender — so the fast phase always sees them.
        if (discoveredInstances && discoveredInstances.length > 0 && headlessInstanceComponents) {
            const componentByContractName = new Map<string, HeadlessInstanceComponent>();
            for (const comp of headlessInstanceComponents) {
                componentByContractName.set(comp.contractName, comp);
            }

            const instancePhaseData: InstancePhaseData = {
                discovered: [],
                carryForwards: {},
            };
            const instanceSlowViewStates: Record<string, object> = {};
            const instanceResolvedData: InstanceSlowRenderResult['resolvedData'] = [];

            for (const instance of discoveredInstances) {
                const comp = componentByContractName.get(instance.contractName);
                if (!comp) continue;

                const coordKey = instance.coordinate.join('/');

                // Normalize props
                const contractProps = comp.contract?.props ?? [];
                const normalizedProps: Record<string, string> = {};
                for (const [key, value] of Object.entries(instance.props)) {
                    const match = contractProps.find(
                        (p) => p.name.toLowerCase() === key.toLowerCase(),
                    );
                    normalizedProps[match ? match.name : key] = value;
                }

                // Always add to discovered (enables fast phase for all instances)
                instancePhaseData.discovered.push({
                    contractName: instance.contractName,
                    props: normalizedProps,
                    coordinate: instance.coordinate,
                });

                // Run slow render if the component has it
                if (comp.compDefinition.slowlyRender) {
                    const services = resolveServices(comp.compDefinition.services);
                    const slowResult = await comp.compDefinition.slowlyRender(
                        normalizedProps,
                        ...services,
                    );
                    if (slowResult.kind === 'PhaseOutput') {
                        instanceSlowViewStates[coordKey] = slowResult.rendered;
                        instancePhaseData.carryForwards[coordKey] = slowResult.carryForward;
                        instanceResolvedData.push({
                            coordinate: instance.coordinate,
                            contract: comp.contract,
                            slowViewState: slowResult.rendered as Record<string, unknown>,
                        });
                    }
                }
            }

            // Store instance data in carryForward for downstream consumption
            (carryForward as any).__instances = instancePhaseData;
            (carryForward as any).__instanceSlowViewStates = instanceSlowViewStates;
            (carryForward as any).__instanceResolvedData = instanceResolvedData;
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
