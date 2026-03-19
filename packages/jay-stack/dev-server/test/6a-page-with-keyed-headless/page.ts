import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
// @ts-ignore
import type { PageSlowViewState } from './page.jay-contract';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState>(
            { title: 'Keyed Headless Test' },
            {},
        ),
    );
