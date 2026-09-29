import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { Props } from '@jay-framework/component';
import { type PageContract, type PageSlowViewState, type PageElementRefs } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Free Ref In Foreach' }, {}),
    )
    .withInteractive((_props: Props<{}>, refs: PageElementRefs) => {
        // DL#198 Case 2 — `dismiss` sits inside the region's own forEach, so it is exposed flat on the
        // region boundary as an elementCollection carrying the per-tag (item) viewState.
        refs.region.dismiss.onclick(({ coordinate, viewState }) =>
            console.log('remove tag', coordinate, viewState),
        );
        return { render: () => ({}) };
    });
