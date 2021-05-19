import {KindergardenGroupListener, KindergartenGroup} from "./kindergarden";
import {JayElement} from "./element";

export class ReferencesManager {
    private refs = {};

    get(id: string) {
        if (!this.refs[id])
            this.refs[id] = new Reference();
        return this.refs[id];
    }

    addRef(id: string, ref: ElementReference<any>) {
        this.get(id).addRef(ref);
    }

    removeRef(id: string, ref: ElementReference<any>) {
        this.get(id).removeRef(ref);
    }

}

export class Reference<T> {
    private elements: Set<ElementReference<T>> = new Set();
    private listeners = [];

    addEventListener(type: string, listener: JayEventListerer<T> | null, options?: boolean | AddEventListenerOptions): void {
        this.listeners.push({type, listener, options})
        this.elements.forEach(ref =>
            ref.addEventListener(type, listener, options))
    }

    addRef(ref: ElementReference<T>) {
        this.elements.add(ref);
        this.listeners.forEach(listener =>
            ref.addEventListener(listener.type, listener.listener, listener.options))
    }

    forEach(handler: (element: JayElement<T>) => void) {
        this.elements.forEach(ref => handler(ref.element));
    }

    removeEventListener(type: string, listener: JayEventListerer<T> | null, options?: EventListenerOptions | boolean): void {
        this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener);
        this.elements.forEach(ref =>
            ref.removeEventListener(type, listener, options))
    }

    removeRef(ref: ElementReference<T>) {
        this.elements.delete(ref);
        this.listeners.forEach(listener =>
            ref.removeEventListener(listener.type, listener.listener, listener.options))
    }
    
}

export type JayEventListerer<T> = (evt: Event, dataContent: T) => void;

export class ElementReference<T> {
    readonly element: JayElement<T>;
    private dataContent: T;
    private listeners = [];
    constructor(element: JayElement<T>, dataContext: T) {
        this.element = element;
        this.dataContent = dataContext
    }

    addEventListener(type: string, listener: JayEventListerer<T>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.dataContent);
        }
        this.element.dom.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler})
    }

    removeEventListener(type: string, listener: JayEventListerer<T> | null, options?: EventListenerOptions | boolean): void {
        let index = this.listeners.findIndex(item => item.type === type && item.listener === listener)
        if (index > -1) {
            let item = this.listeners[index];
            this.listeners.splice(index, 1)
            this.element.dom.removeEventListener(type, item.wrappedHandler, options)
        }
    }
    
    update(newData: T) {
        this.dataContent = newData;
    }
}