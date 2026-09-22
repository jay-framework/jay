/**
 * Server-side slow render orchestration for headless component instances.
 *
 * Given discovered instances (from discoverHeadlessInstances) and their
 * component definitions, runs slowlyRender for each instance and collects
 * the results for downstream consumers (pre-render pipeline, direct mode, fast phase).
 */

import type {
    HeadlessInstanceComponent,
    DiscoveredHeadlessInstance,
    ForEachHeadlessInstance,
    Coordinate,
    RuntimeContract,
} from './types';
export type { ForEachHeadlessInstance } from './types';
import { resolveServices } from './services';
import {
    type InstanceBindingContext,
    enclosingInstanceViewState,
    normalizeAndResolveInstanceProps,
    normalizeInstancePropNames,
} from './resolve-instance-props';
export type { InstanceBindingContext } from './resolve-instance-props';

/**
 * Data needed by the fast phase to render headless instances.
 * Stored in carryForward.__instances so the fast phase can access it
 * (both in pre-render and cached flows).
 */
export interface InstancePhaseData {
    /** Discovered instances with their props and coordinates */
    discovered: Array<{
        contractName: string;
        props: Record<string, string>;
        coordinate: Coordinate;
        /** Enclosing instance coordinate for enclosing-instance-scope resolution (DL#194). */
        parentCoordinate?: Coordinate;
    }>;
    /** CarryForward per instance (keyed by coordinate path, e.g. "p1/product-card:0") */
    carryForwards: Record<string, object>;
    /** Slow ViewState per instance (keyed by coordinate path) */
    slowViewStates?: Record<string, object>;
    /** ForEach instances that need fast-phase per-item rendering */
    forEachInstances?: ForEachHeadlessInstance[];
}

/**
 * Result of running slowlyRender for all discovered headless instances.
 */
export interface InstanceSlowRenderResult {
    /** Resolved data for each instance (for resolveHeadlessInstances pass 2) */
    resolvedData: Array<{
        coordinate: Coordinate;
        contract: RuntimeContract;
        slowViewState: Record<string, unknown>;
    }>;
    /** Per-instance slow ViewState keyed by coordinate (for direct mode merge) */
    slowViewStates: Record<string, object>;
    /** Phase data for the fast render phase */
    instancePhaseData: InstancePhaseData;
}

/**
 * Run slowlyRender for each discovered headless instance.
 *
 * Shared between preRenderJayHtml (pre-render path) and handleDirectRequest (direct path).
 */
export async function slowRenderInstances(
    discovered: DiscoveredHeadlessInstance[],
    headlessInstanceComponents: HeadlessInstanceComponent[],
    bindingContext?: InstanceBindingContext,
): Promise<InstanceSlowRenderResult | undefined> {
    // Build a lookup from contract name to component info
    const componentByContractName = new Map<string, HeadlessInstanceComponent>();
    for (const comp of headlessInstanceComponents) {
        componentByContractName.set(comp.contractName, comp);
    }

    const resolvedData: InstanceSlowRenderResult['resolvedData'] = [];
    const slowViewStates: Record<string, object> = {};
    const discoveredForFast: InstancePhaseData['discovered'] = [];
    const carryForwards: Record<string, object> = {};

    for (const instance of discovered) {
        const comp = componentByContractName.get(instance.contractName);
        if (!comp) continue;

        // Resolve `{key.field}` bindings against the slow scope for this instance's own
        // slow render. A nested instance resolves against its enclosing instance's resolved
        // slow ViewState (DL#194); a top-level instance against the page. Fast / fast+interactive
        // props are not resolvable here and collapse to '' — which is correct: a slow-only
        // component must not read them (DL#189).
        const instanceBindingContext: InstanceBindingContext = {
            ...bindingContext,
            pageViewState: enclosingInstanceViewState(
                instance.parentCoordinate,
                slowViewStates,
                bindingContext?.pageViewState ?? {},
            ),
        };
        const normalizedProps = normalizeAndResolveInstanceProps(
            instance.props,
            comp.contract?.props,
            instanceBindingContext,
        );

        // Always add to discovered so the fast phase sees all instances — even those
        // without slowlyRender (e.g., fast-only components). Store the RAW bindings
        // (names normalized, values unresolved) so the fast phase can re-resolve each
        // prop at its own phase against the merged slow+fast scope (DL#189).
        discoveredForFast.push({
            contractName: instance.contractName,
            props: normalizeInstancePropNames(instance.props, comp.contract?.props),
            coordinate: instance.coordinate,
            parentCoordinate: instance.parentCoordinate,
        });

        if (comp.compDefinition.slowlyRender) {
            const services = resolveServices(comp.compDefinition.services);
            const slowResult = await comp.compDefinition.slowlyRender(normalizedProps, ...services);

            if (slowResult.kind === 'PhaseOutput') {
                const coordKey = instance.coordinate.join('/');

                resolvedData.push({
                    coordinate: instance.coordinate,
                    contract: comp.contract,
                    slowViewState: slowResult.rendered as Record<string, unknown>,
                });

                slowViewStates[coordKey] = slowResult.rendered;
                carryForwards[coordKey] = slowResult.carryForward;
            }
        }
    }

    if (discoveredForFast.length === 0) {
        return undefined;
    }

    return {
        resolvedData,
        slowViewStates,
        instancePhaseData: { discovered: discoveredForFast, carryForwards, slowViewStates },
    };
}
