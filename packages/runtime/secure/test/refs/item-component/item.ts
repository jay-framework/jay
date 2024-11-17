import { EventEmitter, JayEventHandler } from 'jay-runtime';
import { mkComponentEventHandler } from './make-component-event-handler';

export interface ItemProps {
    text: string;
    dataId: string;
}

let instances = {};
export function componentInstance<ParentVS>(dataId: string): ItemType<ParentVS> {
    return instances[dataId];
}

export function clearInstances() {
    instances = {};
}

export interface ItemType<ParentVS> {
    element: any;
    update: (ItemProps) => void;
    mount: () => void;
    unmount: () => void;
    onremove: EventEmitter<string, ParentVS>;
    getItemSummary: () => string;
    addEventListener: (
        type: string,
        handler: JayEventHandler<any, any, any>,
        options?: boolean | AddEventListenerOptions,
    ) => void;
    removeEventListener: (
        type: string,
        handler: JayEventHandler<any, any, any>,
        options?: EventListenerOptions | boolean,
    ) => void;
    _doneClick: () => void;
    _removeClick: () => void;
}

export function Item<ParentVS>(props: ItemProps): ItemType<ParentVS> {
    let done = false;
    let text = props.text;
    let mounted = true;
    let onremove = mkComponentEventHandler<string, ParentVS>();

    let itemInstance = {
        element: null,
        update: (props) => {
            text = props.text;
        },
        mount: () => (mounted = true),
        unmount: () => (mounted = false),
        onremove,
        getItemSummary: () => `item ${text} - Done: ${done} - mounted: ${mounted}`,
        addEventListener: (
            type: string,
            handler: JayEventHandler<any, any, any>,
            options?: boolean | AddEventListenerOptions,
        ) => {
            if (type === 'remove') onremove(handler);
        },
        removeEventListener: (
            type: string,
            handler: JayEventHandler<any, any, any>,
            options?: EventListenerOptions | boolean,
        ) => {
            if (type === 'remove') onremove(undefined);
        },
        _doneClick: () => {
            done = !done;
        },
        _removeClick: () => {
            onremove.emit(`item ${text} - ${done} is removed`);
        },
    };

    instances[props.dataId] = itemInstance;
    return itemInstance;
}
