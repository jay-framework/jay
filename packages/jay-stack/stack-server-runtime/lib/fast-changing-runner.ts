import { AnyFastRenderResult, PageProps, phaseOutput } from '@jay-framework/fullstack-component';
import { DevServerPagePart } from './load-page-parts';
import { resolveServices } from './services';

export async function renderFastChangingData(
    pageParams: object,
    pageProps: PageProps,
    carryForward: object,
    parts: Array<DevServerPagePart>,
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

    return Promise.resolve(phaseOutput(fastViewState, fastCarryForward));
}
