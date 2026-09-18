import {
    ConstructContext,
    element as e,
    dynamicElement as de,
    dynamicText as dt,
    JayElement,
    JayComponent,
    childComp,
    forEach,
    ReferencesManager,
    EventEmitter,
    withSyntheticParentContext,
} from '../../lib/index';
import '../../lib/element-test-types';

// DL#193 Phase 3 (§2) — ref forwarding across a pure (Tier 2) composite.
//
// A pure composite (`Card`) forwards its named inner child-component ref (`<jay:Counter ref="cta">`)
// so the usage site reaches it as `refs.signupCard.cta`. This test mirrors the compiled element
// output (see compiler-jay-html fixtures page-with-forwarded-ref / -foreach): the page childComps a
// Card, which itself childComps a Counter under ref `cta` and re-exposes it by spreading its element
// refs. The forwarded ref must deliver the INNER (card) scope viewState in its event — no re-basing.

interface CounterVS {
    count: number;
}
interface CounterProps {
    initialValue: number;
}
interface CounterComponent<ParentVS>
    extends JayComponent<CounterProps, CounterVS, JayElement<CounterVS, object>> {
    onClick: EventEmitter<number, ParentVS>;
}

function mkEmitter<E, P>(): EventEmitter<E, P> {
    let handler: any;
    const emitter: any = (h: any) => {
        handler = h;
    };
    emitter.emit = (event: E) =>
        handler && handler({ event, viewState: undefined, coordinate: undefined });
    return emitter;
}

// A minimal child component with a `Click` event, mirroring a real headless Counter.
function Counter<ParentVS>(props: CounterProps): CounterComponent<ParentVS> {
    const vs: CounterVS = { count: props.initialValue };
    const [refManager] = ReferencesManager.for({}, [], [], [], []);
    const element = ConstructContext.withRootContext(vs, refManager, () =>
        e('button', { 'data-id': 'counter' }, [dt((s: CounterVS) => `${s.count}`)]),
    ) as JayElement<CounterVS, object>;
    const onClick = mkEmitter<number, ParentVS>();
    (element.dom as HTMLElement).addEventListener('click', () => onClick.emit(vs.count));
    return {
        element,
        update: () => {},
        mount: () => element.mount(),
        unmount: () => element.unmount(),
        onClick,
        addEventListener: (type: string, handler: any) => {
            if (type === 'Click') onClick(handler);
        },
        removeEventListener: () => {},
        get viewState() {
            return vs;
        },
    } as unknown as CounterComponent<ParentVS>;
}

interface CardVS {
    heading: string;
}
interface CardProps {
    heading: string;
}

// The pure composite: renders a Counter under ref `cta` and re-exposes it by spreading `element.refs`
// — exactly what the generated `{ comp: (_props, _refs) => ({ render: () => _props, ..._refs }) }`
// structural passthrough does.
function Card(props: CardProps) {
    const vs: CardVS = { heading: props.heading };
    const [refManager, [refCta]] = ReferencesManager.for({}, [], [], ['cta'], []);
    const element = ConstructContext.withRootContext(vs, refManager, () =>
        e('div', { class: 'card' }, [
            e('h3', {}, [dt((s: CardVS) => s.heading)]),
            childComp((p: CounterProps) => Counter<CardVS>(p), () => ({ initialValue: 0 }), refCta()),
        ]),
    ) as JayElement<CardVS, { cta: CounterComponent<CardVS> }>;
    return {
        element,
        update: (newProps: CardProps) => {
            vs.heading = newProps.heading;
            element.update(vs);
        },
        mount: () => element.mount(),
        unmount: () => element.unmount(),
        ...element.refs,
        get viewState() {
            return vs;
        },
    };
}

describe('DL#193 Phase 3 — pure-composite ref forwarding', () => {
    describe('single composite', () => {
        interface PageVS {
            pageTitle: string;
        }

        function renderPage(viewState: PageVS) {
            const [refManager, [refSignupCard]] = ReferencesManager.for(
                {},
                [],
                [],
                ['signupCard'],
                [],
            );
            const element = ConstructContext.withRootContext(viewState, refManager, () =>
                e('div', {}, [
                    e('h1', {}, [dt((s: PageVS) => s.pageTitle)]),
                    childComp(
                        (p: CardProps) => Card(p),
                        () => ({ heading: 'Sign up' }),
                        refSignupCard(),
                    ),
                ]),
            ) as JayElement<PageVS, any>;
            return { element, refs: refManager.getPublicAPI() as any };
        }

        it('exposes the forwarded inner ref at the usage site', () => {
            const page = renderPage({ pageTitle: 'Home' });
            expect(typeof page.refs.signupCard.cta.onClick).toBe('function');
        });

        it('delivers the inner (card) viewState in the forwarded event — no re-basing', () => {
            const page = renderPage({ pageTitle: 'Home' });
            const handler = vi.fn();
            page.refs.signupCard.cta.onClick(handler);

            (page.element.dom.querySelector('[data-id="counter"]') as HTMLElement).click();

            expect(handler.mock.calls.length).toBe(1);
            expect(handler.mock.calls[0][0].viewState).toEqual({ heading: 'Sign up' });
            expect(handler.mock.calls[0][0].event).toBe(0);
        });
    });

    describe('repeated composite (usage-site forEach) — forwarded collection ref', () => {
        interface PageVS {
            cards: CardVS[];
        }

        function renderPage(viewState: PageVS) {
            const [cardsRefManager, [refCards]] = ReferencesManager.for({}, [], [], [], ['cards']);
            const [refManager] = ReferencesManager.for({}, [], [], [], [], {
                cards: cardsRefManager,
            });
            const element = ConstructContext.withRootContext(viewState, refManager, () =>
                de('div', {}, [
                    forEach(
                        (s: PageVS) => s.cards,
                        (cardVS: CardVS) =>
                            e('div', { class: 'cards' }, [
                                childComp(
                                    (p: CardProps) => Card(p),
                                    (cv: CardVS) => ({ heading: cv.heading }),
                                    refCards(),
                                ),
                            ]),
                        'heading',
                    ),
                ]),
            ) as JayElement<PageVS, any>;
            return { element, refs: refManager.getPublicAPI() as any };
        }

        it('fans onClick to every card, each event carrying that card viewState', () => {
            const page = renderPage({ cards: [{ heading: 'A' }, { heading: 'B' }] });
            const handler = vi.fn();
            page.refs.cards.cards.cta.onClick(handler);

            const buttons = [
                ...page.element.dom.querySelectorAll('[data-id="counter"]'),
            ] as HTMLElement[];
            expect(buttons.length).toBe(2);
            buttons.forEach((b) => b.click());

            expect(handler.mock.calls.length).toBe(2);
            expect(handler.mock.calls.map((c) => c[0].viewState)).toEqual([
                { heading: 'A' },
                { heading: 'B' },
            ]);
        });

        it('find(pred) reaches one card by its viewState', () => {
            const page = renderPage({ cards: [{ heading: 'A' }, { heading: 'B' }] });
            const handler = vi.fn();
            const oneCta = page.refs.cards.cards.cta.find((vs: CardVS) => vs.heading === 'B');
            oneCta.onClick(handler);

            const buttons = [
                ...page.element.dom.querySelectorAll('[data-id="counter"]'),
            ] as HTMLElement[];
            buttons[0].click(); // card A — should NOT fire
            buttons[1].click(); // card B — should fire

            expect(handler.mock.calls.length).toBe(1);
            expect(handler.mock.calls[0][0].viewState).toEqual({ heading: 'B' });
        });

        it('replays the forwarded onClick onto a card added after registration', () => {
            const page = renderPage({ cards: [{ heading: 'A' }] });
            const handler = vi.fn();
            page.refs.cards.cards.cta.onClick(handler);

            page.element.update({ cards: [{ heading: 'A' }, { heading: 'C' }] });

            const buttons = [
                ...page.element.dom.querySelectorAll('[data-id="counter"]'),
            ] as HTMLElement[];
            expect(buttons.length).toBe(2);
            buttons[1].click(); // the newly-added card C

            expect(handler.mock.calls.length).toBe(1);
            expect(handler.mock.calls[0][0].viewState).toEqual({ heading: 'C' });
        });
    });
});

// DL#193 Phase 3 refinement — an override-INJECTED forwarded ref carries the OUTER (override
// authoring) scope, not the composite's own ViewState. The override author writes against the outer
// scope and does not know the composite's internals (§C). The compiler passes a ref-viewState
// selector `(vs, _p1) => _p1` to `childComp` and emits `__parentContext: <outer>` at the composite
// mount site, so the runtime builds a synthetic parent context and the forwarded ref reports the
// outer scope for BOTH onChange and find/map. These tests use viewStates that are DISTINCT between
// the composite (`{ heading }`) and the outer scope (`{ pageTitle }` / `{ id, label }`) so a
// regression to composite scope would be caught (the plain-Phase-3 tests above coincide the two).
interface OuterItemVS {
    id: string;
    label: string;
}

// Mirrors the generated override-injected composite: a Card whose Counter is injected via an
// `<override>`. `makeJayComponent` turns the reserved `__parentContext` prop into a synthetic parent
// context; here we wrap the card's root construction in `withSyntheticParentContext` to reproduce
// that. The forwarded Counter ref is emitted with the `(vs, _p1) => _p1` selector, so its viewState
// re-bases to the synthetic parent's data (the outer scope).
function OverrideCard<Outer>(props: CardProps & { __parentContext: Outer }) {
    const vs: CardVS = { heading: props.heading };
    const syntheticParent = new ConstructContext(props.__parentContext);
    const [refManager, [refCta]] = ReferencesManager.for({}, [], [], ['cta'], []);
    const element = withSyntheticParentContext(syntheticParent, () =>
        ConstructContext.withRootContext(vs, refManager, () =>
            e('div', { class: 'card' }, [
                e('h3', {}, [dt((s: CardVS) => s.heading)]),
                childComp(
                    (p: CounterProps) => Counter<Outer>(p),
                    () => ({ initialValue: 0 }),
                    refCta(),
                    // The override-injected selector: report the outer (parent) scope on the ref.
                    (_vs: CardVS, _p1: Outer) => _p1,
                ),
            ]),
        ),
    ) as JayElement<CardVS, { cta: CounterComponent<Outer> }>;
    return {
        element,
        update: (newProps: CardProps & { __parentContext: Outer }) => {
            vs.heading = newProps.heading;
            syntheticParent.update(newProps.__parentContext);
            element.update(vs);
        },
        mount: () => element.mount(),
        unmount: () => element.unmount(),
        ...element.refs,
        get viewState() {
            return vs;
        },
    };
}

describe('DL#193 Phase 3 refinement — override-injected forwarded refs carry the OUTER scope', () => {
    describe('single injected composite', () => {
        interface PageVS {
            pageTitle: string;
        }

        function renderPage(viewState: PageVS) {
            const [refManager, [refSignupCard]] = ReferencesManager.for(
                {},
                [],
                [],
                ['signupCard'],
                [],
            );
            const element = ConstructContext.withRootContext(viewState, refManager, () =>
                e('div', {}, [
                    e('h1', {}, [dt((s: PageVS) => s.pageTitle)]),
                    childComp(
                        (p: CardProps & { __parentContext: PageVS }) => OverrideCard<PageVS>(p),
                        // The composite mount forwards the whole outer scope as `__parentContext`.
                        (s: PageVS) => ({ heading: 'Sign up', __parentContext: s }),
                        refSignupCard(),
                    ),
                ]),
            ) as JayElement<PageVS, any>;
            return { element, refs: refManager.getPublicAPI() as any };
        }

        it('delivers the OUTER (page) viewState in the forwarded event — not the card heading', () => {
            const page = renderPage({ pageTitle: 'Home' });
            const handler = vi.fn();
            page.refs.signupCard.cta.onClick(handler);

            (page.element.dom.querySelector('[data-id="counter"]') as HTMLElement).click();

            expect(handler.mock.calls.length).toBe(1);
            expect(handler.mock.calls[0][0].viewState).toEqual({ pageTitle: 'Home' });
            expect(handler.mock.calls[0][0].event).toBe(0);
        });
    });

    describe('repeated injected composite (usage-site forEach)', () => {
        interface PageVS {
            items: OuterItemVS[];
        }

        function renderPage(viewState: PageVS) {
            const [cardsRefManager, [refCards]] = ReferencesManager.for({}, [], [], [], ['cards']);
            const [refManager] = ReferencesManager.for({}, [], [], [], [], {
                cards: cardsRefManager,
            });
            const element = ConstructContext.withRootContext(viewState, refManager, () =>
                de('div', {}, [
                    forEach(
                        (s: PageVS) => s.items,
                        (item: OuterItemVS) =>
                            e('div', { class: 'cards' }, [
                                childComp(
                                    (p: CardProps & { __parentContext: OuterItemVS }) =>
                                        OverrideCard<OuterItemVS>(p),
                                    // Each instance forwards its forEach item as `__parentContext`,
                                    // and gives the card an internal heading DISTINCT from the item.
                                    (it: OuterItemVS) => ({
                                        heading: `card:${it.label}`,
                                        __parentContext: it,
                                    }),
                                    refCards(),
                                ),
                            ]),
                        'id',
                    ),
                ]),
            ) as JayElement<PageVS, any>;
            return { element, refs: refManager.getPublicAPI() as any };
        }

        it('fans onClick to every injected card, each event carrying its OUTER item', () => {
            const page = renderPage({
                items: [
                    { id: 'a', label: 'Alpha' },
                    { id: 'b', label: 'Bravo' },
                ],
            });
            const handler = vi.fn();
            page.refs.cards.cards.cta.onClick(handler);

            const buttons = [
                ...page.element.dom.querySelectorAll('[data-id="counter"]'),
            ] as HTMLElement[];
            expect(buttons.length).toBe(2);
            buttons.forEach((b) => b.click());

            expect(handler.mock.calls.length).toBe(2);
            expect(handler.mock.calls.map((c) => c[0].viewState)).toEqual([
                { id: 'a', label: 'Alpha' },
                { id: 'b', label: 'Bravo' },
            ]);
        });

        it('find(pred) matches on the OUTER item scope, not the composite heading', () => {
            const page = renderPage({
                items: [
                    { id: 'a', label: 'Alpha' },
                    { id: 'b', label: 'Bravo' },
                ],
            });
            const handler = vi.fn();
            const oneCta = page.refs.cards.cards.cta.find((vs: OuterItemVS) => vs.label === 'Bravo');
            oneCta.onClick(handler);

            const buttons = [
                ...page.element.dom.querySelectorAll('[data-id="counter"]'),
            ] as HTMLElement[];
            buttons[0].click(); // Alpha — should NOT fire
            buttons[1].click(); // Bravo — should fire

            expect(handler.mock.calls.length).toBe(1);
            expect(handler.mock.calls[0][0].viewState).toEqual({ id: 'b', label: 'Bravo' });
        });
    });
});
