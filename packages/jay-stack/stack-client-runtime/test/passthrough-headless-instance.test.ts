import { describe, it, expect } from 'vitest';
import {
    ConstructContext,
    dynamicText as dt,
    element as e,
    childComp,
    HTMLElementProxy,
    JayElement,
    ReferencesManager,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';
import { makePassthroughHeadlessInstanceComponent } from '../lib/headless-instance-context';

/**
 * DL#196 — a no-code (structural) region compiles through the passthrough instance component.
 * Its whole job is to be an identity: ViewState = props, reactively. These tests pin the
 * reactivity that a prior form (`comp: () => ({ render: () => ({}) })`) broke — that render read
 * nothing, so a parent prop update (e.g. `status="{currentStatus}"`) never re-rendered the region.
 *
 * The passthrough is always constructed as a child inside a parent's render (that is what supplies
 * the construction context), so the tests drive it through `childComp` exactly as the compiler emits,
 * with the parent ViewState feeding the instance's props — the smoke test's vs -> prop -> vs chain.
 */

interface BadgeViewState {
    status: string;
    label: string;
}

interface BadgeProps {
    status: string;
    label: string;
}

interface BadgeRefs {
    status: HTMLElementProxy<BadgeViewState, HTMLSpanElement>;
}

interface BadgeElement extends JayElement<BadgeViewState, BadgeRefs> {}

function renderBadgeElement(
    options?: RenderElementOptions,
): [BadgeRefs, RenderElement<BadgeViewState, BadgeRefs, BadgeElement>] {
    const [refManager, [status]] = ReferencesManager.for(options, ['status'], [], [], []);
    const render = (viewState: BadgeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('span', { id: 'badge-status' }, [dt((vs) => vs.status)], status()),
                e('span', { id: 'badge-label' }, [dt((vs) => vs.label)]),
            ]),
        ) as BadgeElement;
    return [refManager.getPublicAPI() as BadgeRefs, render];
}

// No HEADLESS_INSTANCES context is provided by the parent below, so the instance falls back to
// clientDefaults, which echoes the incoming props as the fast ViewState. The server-data branch
// shares the exact same render reactivity — the only difference is where the base ViewState originates.
const Badge = makePassthroughHeadlessInstanceComponent<
    BadgeProps,
    BadgeViewState,
    BadgeRefs,
    BadgeElement,
    any
>(renderBadgeElement as any, 'badge:0');

interface PageViewState {
    currentStatus: string;
    label: string;
}

interface PageElement extends JayElement<PageViewState, {}> {}

function renderPage(viewState: PageViewState): PageElement {
    const [refManager, [badge]] = ReferencesManager.for({}, [], [], ['badge'], []);
    return ConstructContext.withRootContext(viewState, refManager, () =>
        e('div', {}, [
            childComp(
                (props: BadgeProps) => Badge(props),
                (vs: PageViewState) => ({ status: vs.currentStatus, label: vs.label }),
                badge(),
            ),
        ]),
    ) as PageElement;
}

describe('passthrough headless instance component', () => {
    it('echoes the initial props into the rendered ViewState', () => {
        const page = renderPage({ currentStatus: 'success', label: 'Live Status' });
        expect(page.dom.querySelector('#badge-status')?.textContent).toBe('success');
        expect(page.dom.querySelector('#badge-label')?.textContent).toBe('Live Status');
    });

    it('re-renders reactively when the parent re-drives a prop (vs -> prop -> vs)', () => {
        const page = renderPage({ currentStatus: 'success', label: 'Live Status' });
        expect(page.dom.querySelector('#badge-status')?.textContent).toBe('success');

        page.update({ currentStatus: 'warning', label: 'Live Status' });
        expect(page.dom.querySelector('#badge-status')?.textContent).toBe('warning');

        page.update({ currentStatus: 'error', label: 'Live Status' });
        expect(page.dom.querySelector('#badge-status')?.textContent).toBe('error');
    });
});
