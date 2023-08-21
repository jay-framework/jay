import {dynamicText as dt, element as e} from "../../../lib/element";
import {JayElement} from "../../../lib";
import {HTMLElementProxy} from "../../../lib";
import {JayEventHandler} from "../../../lib";
import {mkComponentEventHandler} from "./make-component-event-handler";
import {ConstructContext} from "../../../lib/context";
import {elemRef} from "../../../lib/node-reference";

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
        e('div', {'data-id': viewState.dataId},[
            e('span', {}, [dt(vs => `${vs.text} - ${vs.done?'done':'tbd'}`)]),
            e('button', {'data-id': 'done'}, ['done'], elemRef('done')),
            e('button', {'data-id': 'remove'}, ['remove'], elemRef('remove'))])
    ) as ItemElement;
}

export interface ItemProps {
    text: string,
    dataId: string
}


export function Item<ParentVS>(props: ItemProps) {
    let done = false;
    let text = props.text;
    let jayElement = renderItem({text, done, dataId: props.dataId});
    let onremove = mkComponentEventHandler<string, ParentVS>();

    jayElement.refs.done.onclick(() => {
        done = !done;
        jayElement.update({text, done, dataId: props.dataId});
    })

    jayElement.refs.remove.onclick(() => {
        onremove.emit(`item ${text} - ${done} is removed`);
    })

    let itemInstance = {
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

