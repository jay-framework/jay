import { AnyFastRenderResult, PageProps, partialRender } from '@jay-framework/fullstack-component';
import { DevServerPagePart } from './load-page-parts';

export async function renderFastChangingData(
    pageParams: object,
    pageProps: PageProps,
    carryForward: object,
    parts: Array<DevServerPagePart>,
): Promise<AnyFastRenderResult> {
    let fastViewState = {};
    let fastCarryForward = {};
    for (const part of parts) {
        const { compDefinition, key } = part;
        if (compDefinition.fastRender) {
            const partSlowlyCarryForward = key ? carryForward[key] : carryForward;
            const fastRenderedPart = await compDefinition.fastRender(
                { ...pageProps, ...pageParams },
                ...[partSlowlyCarryForward],
            );
            if (fastRenderedPart.kind === 'PartialRender') {
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

    return Promise.resolve(partialRender(fastViewState, fastCarryForward));
}
