import {
    ConstructContext,
    element as e,
    dynamicText as dt
} from "../../../lib/element";
import {JayComponent, JayElement} from "../../../lib";
import {ComponentEventDefinition, HTMLElementProxy} from "../../../lib/node-reference-types";
import {JayEventHandler} from "../../../lib/element-types";

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

export interface ItemProps {
    text: string,
    dataId: string
}


export interface ItemComponent extends JayComponent<ItemProps, ItemVS, ItemElement> {
    onremove: ComponentEventDefinition<string, ItemProps>
    getItemSummary(): string
}

function mkComponentEventHandler<EventType, PropsType>() {
    let register: ComponentEventDefinition<EventType, PropsType>;
    register = function(handler: JayEventHandler<EventType, PropsType, void>) {
        register.handler = handler;
    }
    return register;
}

export function Item(props: ItemProps): ItemComponent {
    let done = false;
    let text = props.text;
    let jayElement = renderItem({text, done, dataId: props.dataId});
    let onremove = mkComponentEventHandler<string, ItemProps>();

    jayElement.refs.done.onclick(() => {
        done = !done;
        jayElement.update({text, done, dataId: props.dataId});
    })

    jayElement.refs.remove.onclick(() => {
        if (onremove.handler)
            onremove.handler({event: `item ${text} - ${done} is removed`, viewState: undefined, coordinate: undefined});
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
        getItemSummary: () => `item ${text} - ${done}`,
        addEventListener: (type: string, handler: JayEventHandler<any, any, any>, options?: boolean | AddEventListenerOptions) => {
            if (type === 'remove')
                onremove(handler);
        },
        removeEventListener: (type: string, handler: JayEventHandler<any, any, any>, options?: EventListenerOptions | boolean) => {
            if (type === 'remove')
                onremove(undefined);
        }

    };

    return itemInstance;
}