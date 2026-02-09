import { dynamicText as dt, element as e } from '../../../lib/element';
import { EventEmitter, JayComponent, JayElement, ReferencesManager } from '../../../lib';
import { HTMLElementProxy } from '../../../lib';
import { JayEventHandler } from '../../../lib';
import { mkComponentEventHandler } from './make-component-event-handler';
import { ConstructContext } from '../../../lib/context';

export interface ItemVS {
    text: string;
    done: boolean;
    dataId: string;
}
export interface ItemRefs {
    done: HTMLElementProxy<ItemVS, HTMLElement>;
    remove: HTMLElementProxy<ItemVS, HTMLElement>;
}
export interface ItemElement extends JayElement<ItemVS, ItemRefs> {}

function renderItem(viewState: ItemVS): ItemElement {
    let [refManager, [done, remove]] = ReferencesManager.for({}, ['done', 'remove'], [], [], []);
    return ConstructContext.withRootContext(viewState, refManager, () => {
        return e('div', { 'data-id': viewState.dataId }, [
            e('span', {}, [dt((vs) => `${vs.text} - ${vs.done ? 'done' : 'tbd'}`)]),
            e('button', { 'data-id': 'done' }, ['done'], done()),
            e('button', { 'data-id': 'remove' }, ['remove'], remove()),
        ]);
    }) as ItemElement;
}

export interface ItemProps {
    text: string;
    dataId: string;
}

export interface ItemComponent<ParentVS> extends JayComponent<ItemProps, ItemVS, ItemElement> {
    onremove: EventEmitter<string, ParentVS>;
    getItemSummary: () => string;
}

export function Item<ParentVS>(props: ItemProps): ItemComponent<ParentVS> {
    let done = false;
    let text = props.text;
    let viewState = { text, done, dataId: props.dataId };
    let jayElement = renderItem(viewState);
    let onremove = mkComponentEventHandler<string, ParentVS>();

    jayElement.refs.done.onclick(() => {
        done = !done;
        viewState = { text, done, dataId: props.dataId };
        jayElement.update(viewState);
    });

    jayElement.refs.remove.onclick(() => {
        onremove.emit(`item ${text} - ${done} is removed`);
    });

    let itemInstance = {
        element: jayElement,
        update: (props) => {
            text = props.text;
            viewState = { text, done, dataId: props.dataId };
            jayElement.update(viewState);
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        onremove,
        getItemSummary: () => `item ${text} - ${done}`,
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
        get viewState() {
            return viewState;
        },
    };

    return itemInstance;
}
