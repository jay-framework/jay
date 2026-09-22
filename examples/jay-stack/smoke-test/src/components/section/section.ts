/**
 * Tier 3 component (DL#194): its .ts makes <jay:section> a real component boundary.
 * Outermost of the nested-composition page; internally composes the Tier 2 card (button in card
 * in section). Section's title threads down as card's heading and then as the button's label.
 */
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import {
    type SectionContract,
    type SectionProps,
    type SectionSlowViewState,
} from './section.jay-contract';

export const section = makeJayStackComponent<SectionContract>()
    .withProps<SectionProps>()
    .withSlowlyRender(async (props: SectionProps) =>
        phaseOutput<SectionSlowViewState, {}>({ title: props.title }, {}),
    );
