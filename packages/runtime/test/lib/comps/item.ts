import {
    ConstructContext,
    element as e,
    dynamicText as dt,
    JayElement, JayComponent
} from "../../../lib/element";

export interface ItemVS {
    text: string,
    done: boolean,
    dataId: string
}

export interface ItemElement extends JayElement<ItemVS>{
    done: HTMLElement,
    remove: HTMLElement
}

function renderItem(viewState: ItemVS): ItemElement {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {'data-id': viewState.dataId}, [
            dt(vs => `${vs.text} - ${vs.done?'done':'tbd'}`),
            e('button', {ref: 'done'}, ['done']),
            e('button', {ref: 'remove'}, ['remove'])])
    ) as ItemElement;
}

export interface ItemData {
    text: string,
    dataId: string
}

export interface ItemComponent extends JayComponent<ItemData, ItemVS, ItemElement> {

}

export function Item(props: ItemData): ItemComponent {
    let done = false;
    let text = props.text;
    let jayElement = renderItem({text, done, dataId: props.dataId});

    jayElement.done.onclick = () => {
        done = !done;
        jayElement.update({text, done, dataId: props.dataId});
    }

    jayElement.remove.onclick = () => {
        // call event on parent
    }

    return {
        element: jayElement,
        update: (props) => {
            text = props.text
            jayElement.update({text, done, dataId: props.dataId});
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount()
    }
}