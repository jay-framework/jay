import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Combined Page' }, {}),
    )
    .withInteractive((props, refs) => {
        // Tier 3 (Fork C): the override's nested ref is keyed by slot name in the parent scope.
        refs.richCard.body.cta.onclick(({ viewState }) =>
            console.log('rich card body cta clicked', viewState),
        );
        // Tier 2: the inlined instance forwards its slot-anchor ref under the author-given name.
        refs.promoCard.cta.onclick(({ viewState }) => console.log('promo cta clicked', viewState));
        refs.overrideCard.cta.onclick(({ viewState }) =>
            console.log('override cta clicked', viewState),
        );
        return {
            render: () => ({}),
        };
    });
