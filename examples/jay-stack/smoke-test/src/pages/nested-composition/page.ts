import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Nested Composition' }, {}),
    )
    .withInteractive((props, refs) => {
        return {
            render: () => ({}),
        };
    });
