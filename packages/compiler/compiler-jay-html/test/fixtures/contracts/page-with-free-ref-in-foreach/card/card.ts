/**
 * Placeholder coded (headless) component for test fixtures.
 * Its mere presence (a .ts alongside card.jay-html + card.jay-contract) makes <jay:card>
 * a coded region — a real component boundary compiled via makeHeadlessInstanceComponent.
 *
 * DL#198 Case 2 — the region's body renders an internal forEach over `tags`; each item carries a
 * free ref (`<button ref="dismiss">`) not declared by this contract.
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

const TAGS = [
    { id: 't1', label: 'Alpha' },
    { id: 't2', label: 'Beta' },
];

export const card = makeJayStackComponent<CardContract>()
    .withProps<CardProps>()
    .withSlowlyRender(async (props) => {
        return phaseOutput<CardSlowViewState, CardCarryForward>({}, { heading: props.heading });
    })
    .withFastRender(async (props: CardProps, carryForward: CardCarryForward) => {
        const Pipeline = RenderPipeline.for<CardFastViewState, CardCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { heading: props.heading, tags: TAGS },
            carryForward,
        }));
    })
    .withInteractive(
        (
            _props: Props<CardProps>,
            _refs: CardRefs,
            fastVS: Signals<CardInteractiveViewState>,
            _carryForward: CardCarryForward,
        ) => {
            const [heading] = fastVS.heading;
            const [tags] = fastVS.tags;

            return {
                render: () => ({
                    heading,
                    tags,
                }),
            };
        },
    );
