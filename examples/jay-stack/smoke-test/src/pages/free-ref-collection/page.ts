import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { Props } from '@jay-framework/component';
import { type PageContract, type PageSlowViewState, type PageElementRefs } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>(
            {
                pageTitle: 'Free Ref Collection',
                cards: [
                    { id: 'c1', title: 'Card One' },
                    { id: 'c2', title: 'Card Two' },
                ],
            },
            {},
        ),
    )
    .withInteractive((_props: Props<{}>, refs: PageElementRefs) => {
        // DL#198 Case 1 — `refs.cards.region.dismiss` is an elementCollection: one handler wired across
        // every card instance's dismiss button, each carrying its own composed coordinate/viewState.
        refs.cards.region.dismiss.onclick(({ coordinate, viewState }) =>
            console.log('dismiss free ref clicked', coordinate, viewState),
        );
        return { render: () => ({}) };
    });
