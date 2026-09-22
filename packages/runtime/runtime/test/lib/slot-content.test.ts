import {
    BaseJayElement,
    childComp,
    ConstructContext,
    dynamicText as dt,
    element as e,
    foreignChild,
    HTMLElementProxy,
    JayComponent,
    JayElement,
    ReferencesManager,
} from '../../lib/index';
import '../../lib/element-test-types';
import { JayEventHandler } from '../../lib';

// DL#194 Fork C: a Tier 3 child component whose `body` slot is filled by parent-owned override
// content. The child mounts the parent-built fragment at the anchor via `foreignChild` (no-op
// update) and never feeds it the child view state; the parent drives its update.
interface CardProps {
    heading: string;
}
interface CardVS {
    heading: string;
}
interface CardRefs {
    cardAction: HTMLElementProxy<CardVS, HTMLButtonElement>;
}
interface CardSlots {
    [slot: string]: BaseJayElement<any>;
    body: BaseJayElement<any>;
}
type CardElement = JayElement<CardVS, CardRefs>;

function renderCard(viewState: CardVS, slots: CardSlots): CardElement {
    const [refManager, [cardAction]] = ReferencesManager.for({}, ['cardAction'], [], [], []);
    return ConstructContext.withRootContext(viewState, refManager, () =>
        e('div', { class: 'card' }, [
            e('h2', {}, [dt((vs) => vs.heading)]),
            e('button', { 'data-id': 'action' }, ['Action'], cardAction()),
            foreignChild(slots.body),
        ]),
    ) as CardElement;
}

function Card(props: CardProps, slots: CardSlots): JayComponent<CardProps, CardVS, CardElement> {
    let viewState = { heading: props.heading };
    const jayElement = renderCard(viewState, slots);
    return {
        element: jayElement,
        // expose the inline template refs on the instance, mirroring how a headless instance
        // surfaces its own refs to the parent (`refs.<instance>.<childRef>`).
        ...jayElement.refs,
        update: (p: CardProps) => {
            viewState = { heading: p.heading };
            jayElement.update(viewState);
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        addEventListener: (
            _type: string,
            _handler: JayEventHandler<any, any, any>,
            _options?: boolean | AddEventListenerOptions,
        ) => {},
        removeEventListener: (
            _type: string,
            _handler: JayEventHandler<any, any, any>,
            _options?: EventListenerOptions | boolean,
        ) => {},
        get viewState() {
            return viewState;
        },
    } as unknown as JayComponent<CardProps, CardVS, CardElement>;
}

interface PageVS {
    pageTitle: string;
}
interface PageRefs {
    richCard: CardRefs & { body: { cta: HTMLElementProxy<PageVS, HTMLButtonElement> } };
}
interface PageElement extends JayElement<PageVS, PageRefs> {}

function renderPage(viewState: PageVS): PageElement {
    const [bodyRefManager, [cta]] = ReferencesManager.for({}, ['cta'], [], [], []);
    const [richCardSlotsManager] = ReferencesManager.for({}, [], [], [], [], {
        body: bodyRefManager,
    });
    const [refManager, [richCard]] = ReferencesManager.for({}, [], [], ['richCard'], [], {
        richCard: richCardSlotsManager,
    });
    return ConstructContext.withRootContext(viewState, refManager, () => {
        const slots: CardSlots = {
            body: e('button', { 'data-id': 'cta' }, [dt((vs: PageVS) => vs.pageTitle)], cta()),
        };
        return e('div', {}, [
            childComp(
                (props: CardProps) => Card(props, slots),
                (_vs: PageVS) => ({ heading: 'Rich' }),
                richCard(),
                undefined,
                slots,
            ),
        ]);
    }) as PageElement;
}

describe('DL#194 Fork C — Tier 3 slot content', () => {
    it('mounts the parent-owned slot fragment inside the child DOM at the anchor', () => {
        const page = renderPage({ pageTitle: 'Hello' });
        page.mount();
        const cta = page.dom.querySelector('.card [data-id="cta"]');
        expect(cta?.textContent).toBe('Hello');
    });

    it('updates the slot content from the PARENT view state', () => {
        const page = renderPage({ pageTitle: 'Hello' });
        page.mount();
        page.update({ pageTitle: 'Updated' });
        const cta = page.dom.querySelector('.card [data-id="cta"]');
        expect(cta?.textContent).toBe('Updated');
    });

    it('renders the child component around the slot (child data binding unaffected)', () => {
        const page = renderPage({ pageTitle: 'Hello' });
        page.mount();
        const heading = page.dom.querySelector('.card h2');
        expect(heading?.textContent).toBe('Rich');
    });

    it('exposes the child component ref at refs.richCard.cardAction', () => {
        const handler = vi.fn();
        const page = renderPage({ pageTitle: 'Hello' });
        page.mount();
        page.refs.richCard.cardAction.onclick(handler);
        const actionButton = page.dom.querySelector(
            '.card [data-id="action"]',
        ) as HTMLButtonElement;
        actionButton.click();
        expect(handler.mock.calls.length).toBe(1);
    });

    it('exposes the parent-owned slot ref at refs.richCard.body.cta', () => {
        const handler = vi.fn();
        const page = renderPage({ pageTitle: 'Hello' });
        page.mount();
        page.refs.richCard.body.cta.onclick(handler);
        const ctaButton = page.dom.querySelector('.card [data-id="cta"]') as HTMLButtonElement;
        ctaButton.click();
        expect(handler.mock.calls.length).toBe(1);
    });
});
