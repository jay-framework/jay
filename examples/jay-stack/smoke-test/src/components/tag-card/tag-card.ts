/**
 * Coded (headless) region whose own template has an internal forEach (`tags`). The page adds a
 * `dismiss` free ref INSIDE that region-internal forEach (DL#198 Case 2), so the page exposes it as an
 * elementCollection even though there is a single region instance.
 */
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import {
    type TagCardContract,
    type TagCardProps,
    type TagCardSlowViewState,
} from './tag-card.jay-contract';

export const tagCard = makeJayStackComponent<TagCardContract>()
    .withProps<TagCardProps>()
    .withSlowlyRender(async (props: TagCardProps) =>
        phaseOutput<TagCardSlowViewState, {}>(
            {
                heading: props.heading,
                tags: [
                    { id: 't1', label: 'Tag One' },
                    { id: 't2', label: 'Tag Two' },
                ],
            },
            {},
        ),
    );
