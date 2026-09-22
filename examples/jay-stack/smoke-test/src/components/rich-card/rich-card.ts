/**
 * Tier 3 headfull component with a `body` slot (DL#194 Phase C).
 * Its .ts alongside rich-card.jay-html + rich-card.jay-contract makes <jay:richCard> a Tier 3
 * instance — a real component boundary compiled via makeHeadlessInstanceComponent. The `body` slot
 * is filled at the usage site with parent-scope content (Fork C).
 */
import { type Props } from '@jay-framework/component';
import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import {
    type RichCardContract,
    type RichCardProps,
    type RichCardRefs,
    type RichCardSlowViewState,
    type RichCardFastViewState,
    type RichCardInteractiveViewState,
} from './rich-card.jay-contract';

interface RichCardCarryForward {
    heading: string;
}

export const richCard = makeJayStackComponent<RichCardContract>()
    .withProps<RichCardProps>()
    .withSlowlyRender(async (props) => {
        return phaseOutput<RichCardSlowViewState, RichCardCarryForward>(
            {},
            { heading: props.heading },
        );
    })
    .withFastRender(async (props: RichCardProps, carryForward: RichCardCarryForward) => {
        const Pipeline = RenderPipeline.for<RichCardFastViewState, RichCardCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { heading: props.heading },
            carryForward,
        }));
    })
    .withInteractive(
        (
            _props: Props<RichCardProps>,
            refs: RichCardRefs,
            fastVS: Signals<RichCardInteractiveViewState>,
            carryForward: RichCardCarryForward,
        ) => {
            const [heading] = fastVS.heading;

            refs.cardAction.onclick(({ viewState }) => {
                console.log('rich card action clicked', viewState);
            });

            return {
                render: () => ({
                    heading,
                }),
            };
        },
    );
