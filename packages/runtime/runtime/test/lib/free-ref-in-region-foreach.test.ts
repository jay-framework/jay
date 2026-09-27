import {
    childComp,
    ComponentRefsImpl,
    ConstructContext,
    dynamicText as dt,
    element as e,
    HTMLElementCollectionProxy,
    JayEventHandlerWrapper,
    ReferencesManager,
} from '../../lib';
import { JayElement } from '../../lib';
import '../../lib/element-test-types';
import {
    CardWithList,
    CardWithListComponent,
    CardWithListProps,
    Tag,
} from './comps/card-with-list';

// DL#198 Design D (Case 2) — a free ref that lives inside the region's OWN internal forEach. The region
// builds `dismiss` as a flat elementCollection; each list item's `dismiss()` is constructed inside the item
// context, so every carrier holds the item's viewState and an item-relative coordinate. At region mount the
// page-side FreeReferenceManager reads ALL carriers and mints one page-context RefImpl per item, so a single
// page subscription `refs.region.dismiss` fires for every item, each event carrying that item's viewState and
// a composed coordinate (region path + [<itemId>, 'dismiss']). These tests exercise the runtime refs
// machinery directly (no compiler, no @jay-framework/component).

const PAGE_TITLE = 'Page Title';
const HEADING = 'Card Heading';
const TAGS: Tag[] = [
    { id: 't1', label: 'Alpha' },
    { id: 't2', label: 'Beta' },
    { id: 't3', label: 'Gamma' },
];

interface PageViewState {
    pageTitle: string;
}
interface PageRefs {
    region: CardWithListComponent & { dismiss: HTMLElementCollectionProxy<Tag, HTMLElement> };
}
const PAGE_VS: PageViewState = { pageTitle: PAGE_TITLE };

function mkPage(eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined) {
    let cardComp: CardWithListComponent;
    let [refManager, [regionRef]] = ReferencesManager.for({ eventWrapper }, [], [], ['region'], []);
    // Page-side FreeReferenceManager. The free ref is a COLLECTION (one dismiss per list item), so the
    // page declares it as an elementCollection — `refs.region.dismiss` gets .map/.find plus aggregate events.
    let [pageFreeMgr] = ReferencesManager.for({ eventWrapper }, [], ['dismiss'], [], []);
    (refManager.get('region') as ComponentRefsImpl<any, any>).setFreeRefManager(pageFreeMgr);
    const refsApi = refManager.getPublicAPI() as PageRefs;

    const render = (pageVS: PageViewState = PAGE_VS) =>
        ConstructContext.withRootContext(pageVS, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs: PageViewState) => vs.pageTitle)]),
                childComp(
                    (props) => (cardComp = CardWithList(props as CardWithListProps)),
                    (_vs: PageViewState) => ({ heading: HEADING, tags: TAGS }),
                    regionRef(),
                    pageFreeMgr,
                ),
            ]),
        ) as JayElement<PageViewState, PageRefs>;

    const dismissButtons = () =>
        [
            ...cardComp.element.dom.querySelectorAll<HTMLButtonElement>('button[data-id="dismiss"]'),
        ] as HTMLButtonElement[];
    const dismissButton = (tagId: string) =>
        cardComp.element.dom.querySelector<HTMLButtonElement>(
            `button[data-tag="${tagId}"]`,
        ) as HTMLButtonElement;

    return { refManager, refsApi, render, dismissButtons, dismissButton };
}

describe('DL#198 free ref inside a region-internal forEach (Case 2)', () => {
    describe('page reachability — one subscription fires for every item', () => {
        it('subscribing before render defers and fires for each item after render', () => {
            const { refsApi, render, dismissButtons } = mkPage();
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButtons().forEach((button) => button.click());

            expect(mockCallback.mock.calls.length).toBe(TAGS.length);
        });

        it('subscribing after render also fires for each item', () => {
            const { refsApi, render, dismissButtons } = mkPage();
            const mockCallback = vi.fn();

            render();
            refsApi.region.dismiss.onclick(mockCallback);

            dismissButtons().forEach((button) => button.click());

            expect(mockCallback.mock.calls.length).toBe(TAGS.length);
        });
    });

    describe('payload — per-item viewState + composed coordinate', () => {
        it('carries the clicked item viewState and [region, <itemId>, dismiss] coordinate', () => {
            const { refsApi, render, dismissButton } = mkPage();
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButton('t2').click();

            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0].viewState).toEqual({ id: 't2', label: 'Beta' });
            expect(mockCallback.mock.calls[0][0].coordinate).toEqual(['region', 't2', 'dismiss']);
        });

        it('distinct items fire with their own viewState', () => {
            const { refsApi, render, dismissButton } = mkPage();
            const seen: Tag[] = [];
            const mockCallback = vi.fn((event) => seen.push(event.viewState));

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButton('t3').click();
            dismissButton('t1').click();

            expect(seen).toEqual([
                { id: 't3', label: 'Gamma' },
                { id: 't1', label: 'Alpha' },
            ]);
        });
    });

    describe('collection API over the free ref', () => {
        it('exposes the item viewStates via map', () => {
            const { refsApi, render } = mkPage();

            render();

            const labels = (refsApi.region.dismiss as any).map(
                (_ref: any, viewState: Tag) => viewState.label,
            );
            expect(labels).toEqual(['Alpha', 'Beta', 'Gamma']);
        });

        it('finds a single item by predicate', () => {
            const { refsApi, render } = mkPage();

            render();

            const found = (refsApi.region.dismiss as any).find((viewState: Tag) => viewState.id === 't2');
            expect(found).toBeDefined();
        });
    });

    describe('consumer event wrapper (batching hook)', () => {
        it('runs each free-ref handler through the page eventWrapper', () => {
            const eventWrapper = vi.fn((orig, event) => orig(event));
            const { refsApi, render, dismissButtons } = mkPage(eventWrapper);
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButtons().forEach((button) => button.click());

            expect(eventWrapper.mock.calls.length).toBe(TAGS.length);
            expect(mockCallback.mock.calls.length).toBe(TAGS.length);
        });
    });
});
