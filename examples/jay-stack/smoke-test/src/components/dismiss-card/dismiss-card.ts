/**
 * Coded (headless) region (DL#196): its .ts makes <jay:dismiss-card> a real component boundary, so
 * the page-side free ref (DL#198) is driven onto this region's coordinate/context at mount. Shared by
 * the D-1 (single region) and Case 1 (collection of regions) free-ref example pages.
 */
import { type Props } from '@jay-framework/component';
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import {
    type DismissCardContract,
    type DismissCardProps,
    type DismissCardRefs,
    type DismissCardSlowViewState,
} from './dismiss-card.jay-contract';

export const dismissCard = makeJayStackComponent<DismissCardContract>()
    .withProps<DismissCardProps>()
    .withSlowlyRender(async (props: DismissCardProps) =>
        phaseOutput<DismissCardSlowViewState, {}>({ heading: props.heading }, {}),
    )
    .withInteractive((_props: Props<DismissCardProps>, refs: DismissCardRefs) => {
        refs.cardAction.onclick(({ coordinate, viewState }) =>
            console.log('card action clicked', coordinate, viewState),
        );
        return { render: () => ({}) };
    });
