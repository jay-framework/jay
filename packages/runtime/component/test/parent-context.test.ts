import {
    ConstructContext,
    dynamicText as dt,
    element as e,
    HTMLElementProxy,
    JayElement,
    ReferencesManager,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';
import { makeJayComponent, PARENT_CONTEXT_PROP, Props } from '../lib/';

// DL#193 Phase 2a — a page-authored `<override>` with a dynamic binding resolves
// against the OUTER page scope. The compiler emits the reserved `__parentContext: vs`
// prop into the child component props, and the override body reads `_p1.<field>`
// (parentDepth === 1). This test exercises the runtime seam end-to-end: makeJayComponent
// builds a synthetic parent ConstructContext from `__parentContext`, and `withRootContext`
// links it so the root-level `dt((vs, _p1) => …)` resolves and updates live.

interface CardViewState {
    heading: string;
}
interface PageViewState {
    itemName: string;
}

interface CardRefs {
    cta: HTMLElementProxy<CardViewState, HTMLButtonElement>;
}
interface CardElement extends JayElement<CardViewState, CardRefs> {}
type CardElementRender = RenderElement<CardViewState, CardRefs, CardElement>;
type CardElementPreRender = [CardRefs, CardElementRender];

// Mirrors the compiler's inline headless render: the `cta` override text is a `$parent`
// binding `dt((vs, _p1) => …)` at the component root (not inside a forEach).
function renderCardElement(options?: RenderElementOptions): CardElementPreRender {
    const [refManager, [cta]] = ReferencesManager.for(options, ['cta'], [], [], []);
    const render = (viewState: CardViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h2', { id: 'heading' }, [dt((vs: CardViewState) => vs.heading)]),
                e(
                    'button',
                    { id: 'cta' },
                    [dt((vs: CardViewState, _p1: PageViewState) => `Start ${_p1.itemName} trial`)],
                    cta(),
                ),
            ]),
        ) as CardElement;
    return [refManager.getPublicAPI() as CardRefs, render];
}

// Structural (DL#187) identity passthrough — the component just forwards its props.
function CardComponent({ heading }: Props<CardViewState>) {
    return {
        render: () => ({ heading: heading() }),
    };
}

const Card = makeJayComponent(renderCardElement, CardComponent);

const ctaText = (el: JayElement<any, any>) => el.dom.querySelector('#cta')!.textContent;
const headingText = (el: JayElement<any, any>) => el.dom.querySelector('#heading')!.textContent;

describe('DL#193 Phase 2a — __parentContext seam (component root)', () => {
    it('resolves a $parent (_p1) override binding against __parentContext on initial render', () => {
        const instance = Card({
            heading: 'Premium',
            [PARENT_CONTEXT_PROP]: { itemName: 'Pro' },
        } as any);
        expect(ctaText(instance.element)).toBe('Start Pro trial');
        expect(headingText(instance.element)).toBe('Premium');
    });

    it('updates the $parent leaf live when __parentContext changes (child prop unchanged)', () => {
        const instance = Card({
            heading: 'Premium',
            [PARENT_CONTEXT_PROP]: { itemName: 'Pro' },
        } as any);
        instance.update({
            heading: 'Premium',
            [PARENT_CONTEXT_PROP]: { itemName: 'Enterprise' },
        } as any);
        expect(ctaText(instance.element)).toBe('Start Enterprise trial');
        expect(headingText(instance.element)).toBe('Premium');
    });

    it('updates both the child prop and the $parent leaf when both change', () => {
        const instance = Card({
            heading: 'Premium',
            [PARENT_CONTEXT_PROP]: { itemName: 'Pro' },
        } as any);
        instance.update({
            heading: 'Business',
            [PARENT_CONTEXT_PROP]: { itemName: 'Enterprise' },
        } as any);
        expect(ctaText(instance.element)).toBe('Start Enterprise trial');
        expect(headingText(instance.element)).toBe('Business');
    });
});
