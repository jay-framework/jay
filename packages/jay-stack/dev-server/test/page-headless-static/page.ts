import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState } from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Headless Test' }, {}),
    );
