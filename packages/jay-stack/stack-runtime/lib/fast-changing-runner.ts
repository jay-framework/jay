import { AnyFastRenderResult, PageProps } from './jay-stack-types';
import { partialRender } from './render-results';
import {CompositePart} from "./composite-part";

export async function renderFastChangingData(
    pageParams: object,
    pageProps: PageProps,
    carryForward: object,
    parts: Array<CompositePart>): Promise<AnyFastRenderResult> {
    let fastViewState = {};
    let fastCarryForward = {}
    for (const part of parts) {
        const {compDefinition, key} = part;
        if (compDefinition.fastRender) {
            const partSlowlyCarryForward = key? carryForward[key] : carryForward;
            const fastRenderedPart = await compDefinition.fastRender({ ...pageProps, ...pageParams}, ...[partSlowlyCarryForward])
            if (fastRenderedPart.kind === "PartialRender") {
                if (!key) {
                    fastViewState = {...fastViewState, ...fastRenderedPart.rendered}
                    fastCarryForward = {...fastCarryForward, ...fastRenderedPart.carryForward}
                }
                else {
                    fastViewState[key] = fastRenderedPart.rendered
                    fastCarryForward[key] = fastRenderedPart.carryForward
                }
            }
            else return fastRenderedPart
        }
    }

    return Promise.resolve(partialRender(fastViewState, fastCarryForward));
}
