import {
    ConstructContext,
    element as e,
    dynamicText as dt
} from "../../../lib/element";
import {JayComponent, JayElement} from "../../../lib";
import {ComponentEventDefinition, HTMLElementProxy} from "../../../lib/node-reference-types";

export interface ItemVS {
    text: string,
    done: boolean,
    dataId: string
}
export interface ItemRefs {
    done: HTMLElementProxy<ItemVS, HTMLElement>,
    remove: HTMLElementProxy<ItemVS, HTMLElement>
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
    onremove: ComponentEventDefinition<string>
}

function mkComponentEventHandler<EventType>() {
    let register: ComponentEventDefinition<EventType>;
    register = function(handler: (event: EventType) => void) {
        register.handler = handler;
    }
    return register;
}

export function Item(props: ItemData): ItemComponent {
    let done = false;
    let text = props.text;
    let jayElement = renderItem({text, done, dataId: props.dataId});
    let onremove = mkComponentEventHandler<string>();

    jayElement.refs.done.onclick(() => {
        done = !done;
        jayElement.update({text, done, dataId: props.dataId});
    })

    jayElement.refs.remove.onclick(() => {
        if (onremove.handler)
            onremove.handler(null);
    })

    let itemInstance: ItemComponent = {
        element: jayElement,
        update: (props) => {
            text = props.text
            jayElement.update({text, done, dataId: props.dataId});
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        onremove,
        addEventListener: (type: string, handler: (event: any) => void, options?: boolean | AddEventListenerOptions) => {
            if (type === 'remove')
                onremove(handler);
        },
        removeEventListener: (type: string, handler: (event: any) => void, options?: EventListenerOptions | boolean) => {
            if (type === 'remove')
                onremove(undefined);
        }

    };

    return itemInstance;
}