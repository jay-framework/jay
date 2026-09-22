import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
// Import from page.jay-html (not page.jay-contract): the interactive block reads override-derived
// refs (refs.cards.richCards.body.cta) that live in the jay-html element type, not the bare contract.
import type { PageContract, PageSlowViewState } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>(
            {
                pageTitle: 'ForEach Composite',
                cards: [
                    { id: 'a', title: 'Alpha' },
                    { id: 'b', title: 'Beta' },
                    { id: 'c', title: 'Gamma' },
                ],
            },
            {},
        ),
    )
    .withInteractive((props, refs) => {
        // Under the parent forEach, both tiers expose collection refs keyed to the item scope.
        // The event's viewState is the repeated item (CardOfPageViewState), proving per-item scoping.
        // Tier 3 (Fork C): override's nested ref, keyed by slot, collected across items.
        refs.cards.richCards.body.cta.onclick(({ viewState }) =>
            console.log('rich card body cta clicked', viewState),
        );
        // Tier 2: inlined slot-anchor ref, collected across items.
        refs.cards.promoCards.cta.onclick(({ viewState }) =>
            console.log('promo cta clicked', viewState),
        );
        return {
            render: () => ({}),
        };
    });
