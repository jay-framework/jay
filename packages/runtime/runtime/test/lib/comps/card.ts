import { dynamicText as dt, element as e } from '../../../lib/element';
import { JayComponent, JayElement, ReferencesManager } from '../../../lib';
import { HTMLElementProxy, ConstructContext } from '../../../lib';

export interface CardVS {
    heading: string;
}
// Contract refs — declared by the card's contract, attached as `element.refs`.
export interface CardRefs {
    cardAction: HTMLElementProxy<CardVS, HTMLElement>;
}
// Free refs — region-body element refs NOT declared by the contract. Built in a second, parallel
// ReferencesManager and exposed on the instance as `freeRefs`.
export interface CardFreeRefs {
    dismiss: HTMLElementProxy<CardVS, HTMLElement>;
}
export interface CardElement extends JayElement<CardVS, CardRefs> {}

function renderCard(viewState: CardVS): [CardRefs, ReferencesManager, CardElement] {
    // DL#198 Design D — the region (inner) scope builds TWO managers over ONE render: `refManager` for
    // contract refs (attached as element.refs) and `freeRefManager` for free refs. The free refs are inert
    // carriers — nobody subscribes region-side; they just hold the bound DOM node, the region viewState and
    // the region-relative coordinate. The region exposes the free MANAGER (not its public API) as
    // compCore.freeRefs, so the page-side FreeReferenceManager can read its carriers and drive.
    // withRootContext is manager-agnostic: each ref wires to its own aggregate at mount, so both managers'
    // refs bind correctly from the single construction context.
    let [refManager, [cardAction]] = ReferencesManager.for({}, ['cardAction'], [], [], []);
    let [freeRefManager, [dismiss]] = ReferencesManager.for({}, ['dismiss'], [], [], []);
    const element = ConstructContext.withRootContext(viewState, refManager, () => {
        return e('div', { class: 'card' }, [
            e('h2', {}, [dt((vs) => vs.heading)]),
            e('button', { 'data-id': 'action' }, ['Action'], cardAction()),
            e('button', { 'data-id': 'dismiss' }, ['Dismiss'], dismiss()),
        ]);
    }) as CardElement;
    return [refManager.getPublicAPI() as CardRefs, freeRefManager, element];
}

export interface CardProps {
    heading: string;
}

export interface CardComponent extends JayComponent<CardProps, CardVS, CardElement> {
    // DL#198 Design D — the region exposes its free refs' public API as `freeRefs` (a plain member so
    // makeJayComponent's for-in copy carries it onto the instance). The page-side FreeReferenceManager reads
    // carriers via `freeRefs[name].getCarriers()` to drive. `getHeading` is a plain component member.
    freeRefs: CardFreeRefs;
    getHeading: () => string;
}

// DL#198 Design D — mirrors makeHeadlessInstanceComponent: the region exposes its free refs' public API on
// the component instance as `freeRefs`. Hand-built here so the runtime refs machinery can be tested in
// isolation (no @jay-framework/component).
export function Card(props: CardProps): CardComponent {
    let viewState: CardVS = { heading: props.heading };
    let [refs, freeRefManager, jayElement] = renderCard(viewState);
    const freeRefs = freeRefManager.getPublicAPI() as CardFreeRefs;

    let cardInstance: CardComponent = {
        element: jayElement,
        update: (props: CardProps) => {
            viewState = { heading: props.heading };
            jayElement.update(viewState);
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        freeRefs,
        getHeading: () => viewState.heading,
        get viewState() {
            return viewState;
        },
    };
    return cardInstance;
}
