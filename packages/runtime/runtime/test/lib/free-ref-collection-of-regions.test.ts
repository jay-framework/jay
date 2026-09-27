import {
    childComp,
    ComponentCollectionRefImpl,
    ConstructContext,
    dynamicElement as de,
    dynamicText as dt,
    element as e,
    forEach as fe,
    HTMLElementCollectionProxy,
    JayEventHandlerWrapper,
    ReferencesManager,
} from '../../lib';
import { JayElement } from '../../lib';
import '../../lib/element-test-types';
import { Card, CardComponent, CardProps, CardVS } from './comps/card';

// DL#198 Design D (Case 1) — a COLLECTION of regions (a region rendered under a page forEach). Each card is a
// separate region instance with its own free ref (`dismiss`). The page builds ONE FreeReferenceManager and
// hands it to every item's childComp; at each region mount the driver mints a page-context RefImpl over that
// card's dismiss node onto the shared page aggregate (composed coordinate = [<cardId>, 'region', 'dismiss']).
// A single page subscription `refs.region.dismiss` therefore hears every card, each event carrying that card's
// viewState. Page reachability for a collection relies on the free-ref overlay lifted onto
// ComponentCollectionRefImpl. These tests exercise the runtime refs machinery directly (no compiler).

const PAGE_TITLE = 'Page Title';
interface CardData {
    id: string;
    heading: string;
}
const CARDS: CardData[] = [
    { id: 'c1', heading: 'One' },
    { id: 'c2', heading: 'Two' },
    { id: 'c3', heading: 'Three' },
];

interface PageViewState {
    pageTitle: string;
    cards: CardData[];
}
interface PageRefs {
    region: HTMLElementCollectionProxy<CardVS, HTMLElement> & Record<string, any>;
}
const PAGE_VS: PageViewState = { pageTitle: PAGE_TITLE, cards: CARDS };

function mkPage(eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined) {
    const cards: CardComponent[] = [];
    let [refManager, [regionRef]] = ReferencesManager.for({ eventWrapper }, [], [], [], ['region']);
    // Page-side FreeReferenceManager — ONE per region-name, shared across all items. The free ref is a
    // COLLECTION (one dismiss per card), so `refs.region.dismiss` gets .map/.find plus aggregate events.
    let [pageFreeMgr] = ReferencesManager.for({ eventWrapper }, [], ['dismiss'], [], []);
    (refManager.get('region') as ComponentCollectionRefImpl<any, any>).setFreeRefManager(pageFreeMgr);
    const refsApi = refManager.getPublicAPI() as PageRefs;

    let pageRoot: JayElement<PageViewState, PageRefs>;
    const render = (pageVS: PageViewState = PAGE_VS) =>
        (pageRoot = ConstructContext.withRootContext(pageVS, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs: PageViewState) => vs.pageTitle)]),
                de('div', { class: 'cards' }, [
                    fe(
                        (vs: PageViewState) => vs.cards,
                        (_card: CardData) =>
                            childComp(
                                (props) => {
                                    const c = Card(props as CardProps);
                                    cards.push(c);
                                    return c;
                                },
                                (card: CardData) => ({ heading: card.heading }),
                                regionRef(),
                                pageFreeMgr,
                            ),
                        'id',
                    ),
                ]),
            ]),
        ) as JayElement<PageViewState, PageRefs>);

    const cardByHeading = (heading: string) => cards.find((c) => c.getHeading() === heading)!;
    const dismissButton = (heading: string) =>
        cardByHeading(heading).element.dom.querySelector<HTMLButtonElement>(
            'button[data-id="dismiss"]',
        ) as HTMLButtonElement;
    const allDismissButtons = () =>
        [
            ...(pageRoot.dom as Element).querySelectorAll<HTMLButtonElement>(
                'button[data-id="dismiss"]',
            ),
        ] as HTMLButtonElement[];

    return { refManager, refsApi, render, cardByHeading, dismissButton, allDismissButtons };
}

describe('DL#198 collection of regions — free ref as boundary event source (Case 1)', () => {
    describe('page reachability — one subscription fires for every region', () => {
        it('subscribing before render defers and fires for each region after render', () => {
            const { refsApi, render, allDismissButtons } = mkPage();
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            allDismissButtons().forEach((button) => button.click());

            expect(mockCallback.mock.calls.length).toBe(CARDS.length);
        });

        it('subscribing after render also fires for each region', () => {
            const { refsApi, render, allDismissButtons } = mkPage();
            const mockCallback = vi.fn();

            render();
            refsApi.region.dismiss.onclick(mockCallback);

            allDismissButtons().forEach((button) => button.click());

            expect(mockCallback.mock.calls.length).toBe(CARDS.length);
        });
    });

    describe('payload — per-region viewState + composed coordinate', () => {
        it('carries the clicked region viewState and [<cardId>, region, dismiss] coordinate', () => {
            const { refsApi, render, dismissButton } = mkPage();
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButton('Two').click();

            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0].viewState).toEqual({ heading: 'Two' });
            expect(mockCallback.mock.calls[0][0].coordinate).toEqual(['c2', 'region', 'dismiss']);
        });
    });

    describe('collection API over the free ref', () => {
        it('exposes each region viewState via map', () => {
            const { refsApi, render } = mkPage();

            render();

            const headings = (refsApi.region.dismiss as any).map(
                (_ref: any, viewState: CardVS) => viewState.heading,
            );
            expect(headings).toEqual(['One', 'Two', 'Three']);
        });
    });

    describe('component collection methods still resolve (overlay falls through)', () => {
        it('map over the region collection reaches the region instances', () => {
            const { refsApi, render } = mkPage();

            render();

            const headings = (refsApi.region as any).map((region: CardComponent) =>
                region.getHeading(),
            );
            expect(headings).toEqual(['One', 'Two', 'Three']);
        });
    });

    describe('consumer event wrapper (batching hook)', () => {
        it('runs each region free-ref handler through the page eventWrapper', () => {
            const eventWrapper = vi.fn((orig, event) => orig(event));
            const { refsApi, render, allDismissButtons } = mkPage(eventWrapper);
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            allDismissButtons().forEach((button) => button.click());

            expect(eventWrapper.mock.calls.length).toBe(CARDS.length);
            expect(mockCallback.mock.calls.length).toBe(CARDS.length);
        });
    });
});
