import { describe, it, expect, vi } from 'vitest';
import {
    ComponentRefsImpl,
    ConstructContext,
    dynamicText as dt,
    element as e,
    childComp,
    HTMLElementProxy,
    JayElement,
    JayEvent,
    ReferencesManager,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';
import { makeJayComponent, createSignal } from '@jay-framework/component';
import { makePassthroughHeadlessInstanceComponent } from '../lib/headless-instance-context';

/**
 * DL#198 — a region-body element ref not declared by the region's contract (a "free ref") is
 * re-emitted on the region boundary as a typed event source, reachable from the consuming page as
 * `refs.<regionRef>.<freeRef>.<domEvent>`. The payload carries the region's viewState and a coordinate
 * composed at the page boundary (page-side region coordinate prepended to the region-relative path).
 *
 * The consuming page subscribes in its constructor — before the region renders (childComp runs during
 * render) — so the subscription defers on the page's ComponentRefsImpl aggregate and replays when the
 * region instance is added. Batching stays a property of the consumer: the page handler runs under the
 * page's `batchReactions` (via the region ref's eventWrapper, minted by the page's ReferencesManager),
 * so multiple page-signal writes in one handler collapse to a single synchronous page render.
 */

interface RegionViewState {
    title: string;
}
interface RegionProps {
    title: string;
}
interface RegionRefs {
    // `claim` is a free ref: present in the region body, not declared by the region contract.
    claim: HTMLElementProxy<RegionViewState, HTMLButtonElement>;
}
interface RegionElement extends JayElement<RegionViewState, RegionRefs> {}

function renderRegionElement(
    options?: RenderElementOptions,
): [RegionRefs, RenderElement<RegionViewState, RegionRefs, RegionElement>] {
    const [refManager, [claim]] = ReferencesManager.for(options, ['claim'], [], [], []);
    const render = (viewState: RegionViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [e('button', { id: 'claim-btn' }, [dt((vs) => vs.title)], claim())]),
        ) as RegionElement;
    return [refManager.getPublicAPI() as RegionRefs, render];
}

// A no-code region: identity interactive core (ViewState = props), free ref `claim` re-emitted.
const Region = makePassthroughHeadlessInstanceComponent<
    RegionProps,
    RegionViewState,
    RegionRefs,
    RegionElement,
    any
>(renderRegionElement as any, 'region:0', ['claim']);

interface PageViewState {
    a: number;
    b: number;
    title: string;
}
interface PageRefs {
    region: any; // region component ref; `.claim` is the free-ref event source
}
interface PageElement extends JayElement<PageViewState, PageRefs> {}

let pageRenderCount = 0;
function sumGetter(vs: PageViewState): string {
    pageRenderCount += 1;
    return String(vs.a + vs.b);
}

function renderPageElement(
    options?: RenderElementOptions,
): [PageRefs, RenderElement<PageViewState, PageRefs, PageElement>] {
    // DL#198 Design D — page ref tree stays clean (`region` is a plain string). The page creates a
    // per-region FreeReferenceManager (page scope → page eventWrapper), registers it as the region
    // ComponentRefsImpl's overlay, and hands it to childComp to drive at region mount.
    const [refManager, [region]] = ReferencesManager.for(options, [], [], ['region'], []);
    const [regionFreeRefManager] = ReferencesManager.for(options, ['claim'], [], [], []);
    (refManager.get('region') as ComponentRefsImpl<any, any>).setFreeRefManager(
        regionFreeRefManager,
    );
    const render = (viewState: PageViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('span', { id: 'sum' }, [dt(sumGetter)]),
                childComp(
                    (props: RegionProps) => Region(props),
                    (vs: PageViewState) => ({ title: vs.title }),
                    region(),
                    regionFreeRefManager,
                ),
            ]),
        ) as PageElement;
    return [refManager.getPublicAPI() as PageRefs, render];
}

// Captured across a click so tests can assert the payload.
let captured: JayEvent<any, RegionViewState> | undefined;
const clickSpy = vi.fn();

function PageComponent(_props: any, refs: PageRefs) {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    // Subscribe in the constructor, before the region renders — exercises deferral + replay.
    refs.region.claim.onclick((event: JayEvent<any, RegionViewState>) => {
        captured = event;
        clickSpy();
        // Two page-signal writes: batching parity requires exactly one page render.
        setA(a() + 1);
        setB(b() + 1);
    });
    return {
        render: () => ({ a: a(), b: b(), title: 'T' }),
    };
}

const Page = makeJayComponent(renderPageElement, PageComponent);

describe('DL#198 free ref as boundary event source', () => {
    function setup() {
        pageRenderCount = 0;
        captured = undefined;
        clickSpy.mockClear();
        const page = Page({});
        const button = page.element.dom.querySelector('#claim-btn') as HTMLButtonElement;
        const sum = () => page.element.dom.querySelector('#sum')?.textContent;
        return { page, button, sum };
    }

    it('reaches a region free ref from the page as refs.region.claim.onclick', () => {
        const { button } = setup();
        expect(clickSpy).toHaveBeenCalledTimes(0);
        button.click();
        expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('carries the region viewState and composed coordinate in the payload', () => {
        const { button } = setup();
        button.click();
        expect(captured?.viewState).toEqual({ title: 'T' });
        expect(captured?.coordinate).toEqual(['region', 'claim']);
    });

    it('runs the page handler under the page batch — one render for two signal writes', () => {
        const { button, sum } = setup();
        const before = pageRenderCount;
        button.click();
        // Synchronous, single flush on the page reactive context.
        expect(sum()).toBe('2');
        expect(pageRenderCount).toBe(before + 1);
    });
});
