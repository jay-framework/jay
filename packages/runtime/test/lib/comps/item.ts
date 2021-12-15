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
export interface ItemRefs {
    done: HTMLElement,
    remove: HTMLElement
}
export interface ItemElement extends JayElement<ItemVS, ItemRefs> {}

function renderItem(viewState: ItemVS): ItemElement {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {'data-id': viewState.dataId}, [
            e('span', {}, [dt(vs => `${vs.text} - ${vs.done?'done':'tbd'}`)]),
            e('button', {'data-id': 'done', ref: 'done'}, ['done']),
            e('button', {'data-id': 'remove', ref: 'remove'}, ['remove'])])
    ) as ItemElement;
}

export interface ItemData {
    text: string,
    dataId: string
}

export interface ItemComponent extends JayComponent<ItemData, ItemVS, ItemElement> {
    onremove?: (event: any) => void
}

export function Item(props: ItemData): ItemComponent {
    let done = false;
    let text = props.text;
    let jayElement = renderItem({text, done, dataId: props.dataId});

    jayElement.refs.done.onclick = () => {
        done = !done;
        jayElement.update({text, done, dataId: props.dataId});
    }

    jayElement.refs.remove.onclick = () => {
        if (itemInstance.onremove)
            itemInstance.onremove(null);
    }

    let itemInstance: ItemComponent = {
        element: jayElement,
        update: (props) => {
            text = props.text
            jayElement.update({text, done, dataId: props.dataId});
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        onremove: undefined,
        addEventListener: (type: string, handler: (event: any) => void, options?: boolean | AddEventListenerOptions) => {
            if (type === 'remove')
                itemInstance.onremove = handler;
        },
        removeEventListener: (type: string, handler: (event: any) => void, options?: EventListenerOptions | boolean) => {
            if (type === 'remove')
                itemInstance.onremove = undefined;
        }

    };

    return itemInstance;
}