/**
 * Placeholder coded (headless) component for test fixtures.
 * Its mere presence (a .ts alongside card.jay-html + card.jay-contract) makes <jay:card>
 * a coded region — a real component boundary compiled via makeHeadlessInstanceComponent.
 */
import { type Props } from '@jay-framework/component';
import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import {
    type CardContract,
    type CardProps,
    type CardRefs,
    type CardSlowViewState,
    type CardFastViewState,
    type CardInteractiveViewState,
} from './card.jay-contract';

interface CardCarryForward {
    heading: string;
}

export const card = makeJayStackComponent<CardContract>()
    .withProps<CardProps>()
    .withSlowlyRender(async (props) => {
        return phaseOutput<CardSlowViewState, CardCarryForward>({}, { heading: props.heading });
    })
    .withFastRender(async (props: CardProps, carryForward: CardCarryForward) => {
        const Pipeline = RenderPipeline.for<CardFastViewState, CardCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { heading: props.heading },
            carryForward,
        }));
    })
    .withInteractive(
        (
            _props: Props<CardProps>,
            refs: CardRefs,
            fastVS: Signals<CardInteractiveViewState>,
            carryForward: CardCarryForward,
        ) => {
            const [heading] = fastVS.heading;

            refs.cardAction.onclick(() => {
                // placeholder
            });

            return {
                render: () => ({
                    heading,
                }),
            };
        },
    );
