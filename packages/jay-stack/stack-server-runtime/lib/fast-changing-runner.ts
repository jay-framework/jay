import { AnyFastRenderResult, PageProps, phaseOutput } from '@jay-framework/fullstack-component';
import { DevServerPagePart, HeadlessInstanceComponent } from './load-page-parts';
import { resolveServices } from './services';
import type { InstancePhaseData } from './instance-slow-render';
import type { ForEachHeadlessInstance } from '@jay-framework/compiler-jay-html';
import { computeForEachInstanceKey } from '@jay-framework/compiler-shared';

/**
 * Resolve a dot-path value from an object (e.g., "allProducts.items" → obj.allProducts.items).
 */
function resolvePathValue(obj: any, path: string): any {
    return path.split('.').reduce((current, segment) => current?.[segment], obj);
}

/**
 * Resolve a binding expression against a forEach item.
 * Handles "{fieldName}" → item.fieldName, or literal strings.
 */
function resolveBinding(binding: string, item: any): string {
    const match = binding.match(/^\{(.+)\}$/);
    if (match) {
        return String(item[match[1]] ?? '');
    }
    return binding;
}

export async function renderFastChangingData(
    pageParams: object,
    pageProps: PageProps,
    carryForward: object,
    parts: Array<DevServerPagePart>,
    instancePhaseData?: InstancePhaseData,
    forEachInstances?: ForEachHeadlessInstance[],
    headlessInstanceComponents?: HeadlessInstanceComponent[],
    mergedSlowViewState?: object,
): Promise<AnyFastRenderResult> {
    let fastViewState = {};
    let fastCarryForward = {};
    for (const part of parts) {
        const { compDefinition, key, contractInfo } = part;
        if (compDefinition.fastRender) {
            const partSlowlyCarryForward = key ? carryForward[key] : carryForward;

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

            const fastRenderedPart = await compDefinition.fastRender(
                partProps,
                partSlowlyCarryForward,
                ...services,
            );
            if (fastRenderedPart.kind === 'PhaseOutput') {
                if (!key) {
                    fastViewState = { ...fastViewState, ...fastRenderedPart.rendered };
                    fastCarryForward = { ...fastCarryForward, ...fastRenderedPart.carryForward };
                } else {
                    fastViewState[key] = fastRenderedPart.rendered;
                    fastCarryForward[key] = fastRenderedPart.carryForward;
                }
            } else return fastRenderedPart;
        }
    }

    // Run fast render for headless instances (DL#109).
    // Absorbs renderFastChangingDataForInstances + renderFastChangingDataForForEachInstances.
    const instanceViewStates: Record<string, object> = {};
    const instanceCarryForwards: Record<string, object> = {};

    if (instancePhaseData && headlessInstanceComponents) {
        const componentByContractName = new Map<string, HeadlessInstanceComponent>();
        for (const comp of headlessInstanceComponents) {
            componentByContractName.set(comp.contractName, comp);
        }

        // Static instances
        for (const instance of instancePhaseData.discovered) {
            const coordKey = instance.coordinate.join('/');
            const comp = componentByContractName.get(instance.contractName);
            if (!comp || !comp.compDefinition.fastRender) continue;

            const services = resolveServices(comp.compDefinition.services);
            const cf = instancePhaseData.carryForwards[coordKey];

            // fastRender signature depends on whether slow phase exists
            const fastResult = comp.compDefinition.slowlyRender
                ? await comp.compDefinition.fastRender(instance.props, cf, ...services)
                : await comp.compDefinition.fastRender(instance.props, ...services);

            if (fastResult.kind === 'PhaseOutput') {
                // Merge instance slow ViewState (if any) with fast ViewState.
                // Instance slow data is stored in carryForward.__instanceSlowViewStates by runSlowlyForPage.
                const instanceSlowVS = (carryForward as any)?.__instanceSlowViewStates?.[coordKey];
                instanceViewStates[coordKey] = instanceSlowVS
                    ? { ...instanceSlowVS, ...fastResult.rendered }
                    : fastResult.rendered;
                if (fastResult.carryForward) {
                    instanceCarryForwards[coordKey] = fastResult.carryForward;
                }
            }
        }
    }

    // ForEach instances
    if (forEachInstances && forEachInstances.length > 0 && headlessInstanceComponents) {
        const componentByContractName = new Map<string, HeadlessInstanceComponent>();
        for (const comp of headlessInstanceComponents) {
            componentByContractName.set(comp.contractName, comp);
        }

        const mergedForEachVS = { ...(mergedSlowViewState || {}), ...fastViewState };

        for (const instance of forEachInstances) {
            const comp = componentByContractName.get(instance.contractName);
            if (!comp) continue;

            const items = resolvePathValue(mergedForEachVS, instance.forEachPath);
            if (!Array.isArray(items)) continue;

            const contractProps = comp.contract?.props ?? [];
            const normalizePropName = (key: string) =>
                contractProps.find((p) => p.name.toLowerCase() === key.toLowerCase())?.name ?? key;

            for (const item of items) {
                const trackByValue = String(item[instance.trackBy]);
                const props: Record<string, string> = {};
                for (const [propName, binding] of Object.entries(instance.propBindings)) {
                    props[normalizePropName(propName)] = resolveBinding(String(binding), item);
                }

                if (comp.compDefinition.fastRender) {
                    const services = resolveServices(comp.compDefinition.services);

                    let slowVS: object = {};
                    let cf: object = {};
                    if (comp.compDefinition.slowlyRender) {
                        const slowResult = await comp.compDefinition.slowlyRender(
                            props,
                            ...services,
                        );
                        if (slowResult.kind === 'PhaseOutput') {
                            slowVS = slowResult.rendered;
                            cf = slowResult.carryForward;
                        }
                    }

                    const fastResult = comp.compDefinition.slowlyRender
                        ? await comp.compDefinition.fastRender(props, cf, ...services)
                        : await comp.compDefinition.fastRender(props, ...services);

                    if (fastResult.kind === 'PhaseOutput') {
                        const coord = computeForEachInstanceKey(
                            trackByValue,
                            instance.coordinateSuffix,
                        );
                        instanceViewStates[coord] = { ...slowVS, ...fastResult.rendered };
                        if (fastResult.carryForward) {
                            instanceCarryForwards[coord] = fastResult.carryForward;
                        }
                    }
                }
            }
        }
    }

    // Merge instance data into viewState
    if (Object.keys(instanceViewStates).length > 0) {
        (fastViewState as any).__headlessInstances = instanceViewStates;
    }
    if (Object.keys(instanceCarryForwards).length > 0) {
        (fastCarryForward as any).__headlessInstances = instanceCarryForwards;
    }

    return Promise.resolve(phaseOutput(fastViewState, fastCarryForward));
}
