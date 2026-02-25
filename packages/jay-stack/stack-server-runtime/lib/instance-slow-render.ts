/**
 * Server-side slow render orchestration for headless component instances.
 *
 * Given discovered instances (from discoverHeadlessInstances) and their
 * component definitions, runs slowlyRender for each instance and collects
 * the results for downstream consumers (pre-render pipeline, direct mode, fast phase).
 */

import type {
    DiscoveredHeadlessInstance,
    ForEachHeadlessInstance,
} from '@jay-framework/compiler-jay-html';
export type { ForEachHeadlessInstance } from '@jay-framework/compiler-jay-html';
import type { HeadlessInstanceComponent } from './load-page-parts';
import type { Coordinate } from '@jay-framework/runtime';
import type { Contract } from '@jay-framework/compiler-jay-html';
import { resolveServices } from './services';

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
    }>;
    /** CarryForward per instance (keyed by coordinate path, e.g. "p1/product-card:0") */
    carryForwards: Record<string, object>;
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
        contract: Contract;
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
        if (!comp || !comp.compDefinition.slowlyRender) {
            continue;
        }

        const services = resolveServices(comp.compDefinition.services);
        const slowResult = await comp.compDefinition.slowlyRender(instance.props, ...services);

        if (slowResult.kind === 'PhaseOutput') {
            const coordKey = instance.coordinate.join('/');

            resolvedData.push({
                coordinate: instance.coordinate,
                contract: comp.contract,
                slowViewState: slowResult.rendered as Record<string, unknown>,
            });

            slowViewStates[coordKey] = slowResult.rendered;
            carryForwards[coordKey] = slowResult.carryForward;

            discoveredForFast.push({
                contractName: instance.contractName,
                props: instance.props,
                coordinate: instance.coordinate,
            });
        }
    }

    if (discoveredForFast.length === 0) {
        return undefined;
    }

    return {
        resolvedData,
        slowViewStates,
        instancePhaseData: { discovered: discoveredForFast, carryForwards },
    };
}

/**
 * Validate that forEach headless instances do not have a slow phase.
 *
 * Components with slowlyRender cannot be used inside forEach because
 * forEach items are only known at request time, after slow rendering completes.
 *
 * @returns Array of validation error messages (empty if all valid)
 */
export function validateForEachInstances(
    forEachInstances: ForEachHeadlessInstance[],
    headlessInstanceComponents: HeadlessInstanceComponent[],
): string[] {
    const componentByContractName = new Map<string, HeadlessInstanceComponent>();
    for (const comp of headlessInstanceComponents) {
        componentByContractName.set(comp.contractName, comp);
    }

    const validations: string[] = [];
    for (const instance of forEachInstances) {
        const comp = componentByContractName.get(instance.contractName);
        if (comp?.compDefinition.slowlyRender) {
            validations.push(
                `<jay:${instance.contractName}> inside forEach has a slow rendering phase. ` +
                    `Headless components with slow phases cannot be used inside forEach because ` +
                    `forEach items are only known at request time, after slow rendering completes. ` +
                    `Use slowForEach instead, or remove the slow phase from the component.`,
            );
        }
    }
    return validations;
}
