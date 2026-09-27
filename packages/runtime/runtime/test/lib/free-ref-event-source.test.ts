import {
    childComp,
    ComponentRefsImpl,
    ConstructContext,
    dynamicText as dt,
    element as e,
    HTMLElementProxy,
    JayEventHandlerWrapper,
    ReferencesManager,
} from '../../lib';
import { JayElement } from '../../lib';
import '../../lib/element-test-types';
import { Card, CardComponent, CardProps, CardVS } from './comps/card';

// DL#198 Design D — free refs as boundary event sources, driven from the page.
// A region-body element ref not declared by the region's contract (a "free ref") is built in the region's
// second ReferencesManager as an inert carrier. The PAGE creates a FreeReferenceManager per region (page
// scope → page eventWrapper) and registers it as the region ComponentRefsImpl's overlay. At region mount the
// page manager drives: it mints a page-context RefImpl over each free-ref DOM node (page eventWrapper +
// composed coordinate), so `refs.<regionRef>.<freeRef>` is a real element ref whose events carry the region's
// viewState and a composed coordinate, and whose exec$/reads pass straight through. These tests exercise the
// runtime refs machinery directly (no compiler, no @jay-framework/component). The page `.for()` declares
// `region` as a PLAIN STRING — the region's main ref tree stays clean.

const HEADING = 'Card Heading';
const PAGE_TITLE = 'Page Title';

interface PageViewState {
    pageTitle: string;
}
interface PageRefs {
    region: CardComponent & { dismiss: HTMLElementProxy<CardVS, HTMLElement> };
}
const PAGE_VS: PageViewState = { pageTitle: PAGE_TITLE };

function mkPage(eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined) {
    let cardComp: CardComponent;
    let [refManager, [regionRef]] = ReferencesManager.for(
        { eventWrapper },
        [],
        [],
        ['region'],
        [],
    );
    // DL#198 Design D — page-side FreeReferenceManager for the region's free refs (page scope → page
    // eventWrapper). Registered as the region ComponentRefsImpl's overlay and handed to childComp to drive.
    let [pageFreeMgr] = ReferencesManager.for({ eventWrapper }, ['dismiss'], [], [], []);
    (refManager.get('region') as ComponentRefsImpl<any, any>).setFreeRefManager(pageFreeMgr);
    const refsApi = refManager.getPublicAPI() as PageRefs;

    const render = (pageVS: PageViewState = PAGE_VS) =>
        ConstructContext.withRootContext(pageVS, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs: PageViewState) => vs.pageTitle)]),
                childComp(
                    (props) => (cardComp = Card(props as CardProps)),
                    (_vs: PageViewState) => ({ heading: HEADING }),
                    regionRef(),
                    pageFreeMgr,
                ),
            ]),
        ) as JayElement<PageViewState, PageRefs>;

    const dismissButton = () =>
        cardComp.element.dom.querySelector('button[data-id="dismiss"]') as HTMLButtonElement;

    return { refManager, refsApi, render, dismissButton };
}

describe('DL#198 free refs as boundary event sources (driven from the page)', () => {
    describe('region exposes the free ref via its free manager (region-relative)', () => {
        it('the region instance exposes free refs on `freeRefs` as real element proxies', () => {
            const card = Card({ heading: HEADING });
            const mockCallback = vi.fn();

            // directly on the region (no page boundary): region-relative coordinate, region wrapper
            card.freeRefs.dismiss.onclick(mockCallback);
            card.element.dom.querySelector<HTMLButtonElement>('button[data-id="dismiss"]')!.click();

            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0].viewState).toEqual({ heading: HEADING });
            expect(mockCallback.mock.calls[0][0].coordinate).toEqual(['dismiss']);
        });
    });

    describe('page reachability', () => {
        it('subscribing before the region renders defers and fires after render', () => {
            const { refsApi, render, dismissButton } = mkPage();
            const mockCallback = vi.fn();

            // constructor-before-render: subscribe while no region instance exists yet
            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButton().click();

            expect(mockCallback.mock.calls.length).toBe(1);
        });

        it('subscribing after the region renders also fires', () => {
            const { refsApi, render, dismissButton } = mkPage();
            const mockCallback = vi.fn();

            render();
            refsApi.region.dismiss.onclick(mockCallback);

            dismissButton().click();

            expect(mockCallback.mock.calls.length).toBe(1);
        });
    });

    describe('payload — region viewState + composed coordinate', () => {
        it('carries the region viewState and the page-region path prepended to the free-ref coordinate', () => {
            const { refsApi, render, dismissButton } = mkPage();
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButton().click();

            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0].viewState).toEqual({ heading: HEADING });
            expect(mockCallback.mock.calls[0][0].coordinate).toEqual(['region', 'dismiss']);
        });
    });

    describe('member resolution', () => {
        it('a free-ref member is subscribable pre-render (overlay to the page FreeReferenceManager)', () => {
            const { refsApi } = mkPage();

            // pre-render, a free-ref name resolves to the page FreeReferenceManager's aggregate proxy,
            // exposing on<event>/addEventListener; subscriptions here replay onto the driven ref at mount
            expect(typeof (refsApi.region.dismiss as any).onclick).toBe('function');
            expect(typeof (refsApi.region.dismiss as any).addEventListener).toBe('function');
        });

        it('an unknown member is undefined pre-render (existence checks stay honest)', () => {
            const { refsApi } = mkPage();

            // not a component member and not a free ref → undefined, not a truthy deferring proxy
            expect((refsApi.region as any).notARef).toBeUndefined();
        });

        it('component members resolve to the region instance after render', () => {
            const { refsApi, render } = mkPage();

            render();

            expect(typeof (refsApi.region as any).getHeading).toBe('function');
            expect((refsApi.region as any).getHeading()).toBe(HEADING);
        });
    });

    describe('exec$ passes through to the region element', () => {
        it('reaches the region DOM element via the composed free ref', async () => {
            const { refsApi, render } = mkPage();

            render();

            const tag = await refsApi.region.dismiss.exec$((el: HTMLElement) => el.tagName);
            expect(tag).toBe('BUTTON');
        });
    });

    describe('consumer event wrapper (batching hook)', () => {
        it('runs the free-ref handler through the page eventWrapper', () => {
            const eventWrapper = vi.fn((orig, event) => orig(event));
            const { refsApi, render, dismissButton } = mkPage(eventWrapper);
            const mockCallback = vi.fn();

            refsApi.region.dismiss.onclick(mockCallback);
            render();

            dismissButton().click();

            expect(eventWrapper.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls.length).toBe(1);
        });
    });
});
