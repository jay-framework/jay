import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { Props } from '@jay-framework/component';
import { type PageContract, type PageSlowViewState, type PageElementRefs } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Free Ref' }, {}))
    .withInteractive((_props: Props<{}>, refs: PageElementRefs) => {
        // DL#198 — `dismiss` is a free ref: a region-body element ref NOT declared by the card
        // contract, re-emitted on the region boundary and reached from the page as
        // `refs.plainCard.dismiss` (typed HTMLElementProxy carrying the region's viewState).
        refs.plainCard.dismiss.onclick(({ coordinate, viewState }) =>
            console.log('dismiss free ref clicked', coordinate, viewState),
        );
        return { render: () => ({}) };
    });
