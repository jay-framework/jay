import {
    makeJayStackComponent,
    phaseOutput,
    type PageProps,
} from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState, PageFastViewState } from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>(
            {
                slowItems: [
                    { _id: 's1', label: 'Slow Item 1' },
                    { _id: 's2', label: 'Slow Item 2' },
                ],
            },
            {},
        ),
    )
    .withFastRender(async () =>
        phaseOutput<PageFastViewState, {}>(
            {
                fastItems: [
                    { _id: 'f1', label: 'Fast Item 1' },
                    { _id: 'f2', label: 'Fast Item 2' },
                    { _id: 'f3', label: 'Fast Item 3' },
                ],
            },
            {},
        ),
    );
