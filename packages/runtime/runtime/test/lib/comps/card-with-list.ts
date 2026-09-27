import { dynamicElement as de, dynamicText as dt, element as e, forEach as fe } from '../../../lib/element';
import { JayComponent, JayElement, ReferencesManager } from '../../../lib';
import { HTMLElementCollectionProxy, ConstructContext } from '../../../lib';

// DL#198 Design D (Case 2) — a region whose free ref lives inside the region's own internal forEach.
// Each list item renders a `dismiss` button that is NOT declared by the card's contract (a free ref).
// The free ref is a FLAT elementCollection: each `dismiss()` is constructed inside the forEach item
// context, so every carrier gets the ITEM's viewState and an item-relative coordinate ([<tagId>, 'dismiss']).
// The page-side FreeReferenceManager reads all carriers at region mount and mints one page-context RefImpl
// per item — no manager nesting is needed because the coordinate/viewState come from the construction
// context, not from the manager structure.

export interface Tag {
    id: string;
    label: string;
}
export interface CardWithListVS {
    heading: string;
    tags: Tag[];
}
// Contract refs — none in this fixture; the card exposes only free refs.
export interface CardWithListRefs {}
// Free refs — a COLLECTION: one `dismiss` per list item.
export interface CardWithListFreeRefs {
    dismiss: HTMLElementCollectionProxy<Tag, HTMLElement>;
}
export interface CardWithListElement extends JayElement<CardWithListVS, CardWithListRefs> {}

function renderCardWithList(
    viewState: CardWithListVS,
): [CardWithListRefs, ReferencesManager, CardWithListElement] {
    // Two managers over one render: `refManager` for contract refs (none here), `freeRefManager` for the
    // free ref. `dismiss` is an elementCollection so each forEach item contributes its own carrier.
    let [refManager] = ReferencesManager.for({}, [], [], [], []);
    let [freeRefManager, [dismiss]] = ReferencesManager.for({}, [], ['dismiss'], [], []);
    const element = ConstructContext.withRootContext(viewState, refManager, () => {
        return de('div', { class: 'card' }, [
            e('h2', {}, [dt((vs) => vs.heading)]),
            de('ul', {}, [
                fe(
                    (vs: CardWithListVS) => vs.tags,
                    (tag: Tag) =>
                        e('li', {}, [
                            dt((t: Tag) => t.label),
                            e('button', { 'data-id': 'dismiss', 'data-tag': tag.id }, ['x'], dismiss()),
                        ]),
                    'id',
                ),
            ]),
        ]);
    }) as CardWithListElement;
    return [refManager.getPublicAPI() as CardWithListRefs, freeRefManager, element];
}

export interface CardWithListProps {
    heading: string;
    tags: Tag[];
}

export interface CardWithListComponent
    extends JayComponent<CardWithListProps, CardWithListVS, CardWithListElement> {
    freeRefs: CardWithListFreeRefs;
    getHeading: () => string;
}

// Hand-built instance (no @jay-framework/component) mirroring makeHeadlessInstanceComponent: exposes the
// region's free refs public API on the instance as `freeRefs` for the page-side driver to read.
export function CardWithList(props: CardWithListProps): CardWithListComponent {
    let viewState: CardWithListVS = { heading: props.heading, tags: props.tags };
    let [, freeRefManager, jayElement] = renderCardWithList(viewState);
    const freeRefs = freeRefManager.getPublicAPI() as CardWithListFreeRefs;

    let cardInstance: CardWithListComponent = {
        element: jayElement,
        update: (props: CardWithListProps) => {
            viewState = { heading: props.heading, tags: props.tags };
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
