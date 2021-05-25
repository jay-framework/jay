import {JayElement} from "./element";

export class ReferencesManager {
    private refs = {};

    get(id: string, autoCreate: boolean = false): Reference<any> | undefined {
        if (!this.refs[id] && autoCreate)
            this.refs[id] = new Reference();
        return this.refs[id];
    }

    addRef(id: string, ref: ElementReference<any>) {
        this.get(id, true).addRef(ref);
    }

    removeRef(id: string, ref: ElementReference<any>) {
        this.get(id, true).removeRef(ref);
    }

    applyToElement<T>(element: JayElement<T>): JayElement<T> {
        let enrichedRefs = Object.keys(this.refs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(this.refs[key])
            return enriched;
        }, {})
        return {...enrichedRefs, ...element};
    }
}

type GlobalEventHandlers<T> = {
    [Property in keyof GlobalEventHandlersEventMap as `on${Property}`]: (listener: JayEventListener<GlobalEventHandlersEventMap[Property], T>) => void;
}

export interface ReferenceAPI<T> extends GlobalEventHandlers<T>{
    forEach(handler: (element: JayElement<T>) => void)
    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: EventListenerOptions | boolean): void
}

const proxyHandler = {
    get: function (target, prop, receiver) {
        if (prop.indexOf("on") === 0) {
            let event = prop.substring(2);
            return listener => target.addEventListener(event, listener);
        }
        return target[prop];
    }
}
export function newReferenceProxy<T>(ref: Reference<T>): ReferenceAPI<T> {
    return new Proxy(ref, proxyHandler) as ReferenceAPI<T>;
}

export class Reference<T> {
    private elements: Set<ElementReference<T>> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: boolean | AddEventListenerOptions): void {
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

    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: EventListenerOptions | boolean): void {
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

export type JayEventListener<E, T> = (evt: E, dataContent: T) => void;

export class ElementReference<T> {
    element: JayElement<T>;
    private dataContent: T;
    private listeners = [];
    constructor() {
    }

    setElement(element: JayElement<T>, dataContext: T) {
        this.element = element;
        this.dataContent = dataContext
    }

    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, T>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.dataContent);
        }
        this.element.dom.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler})
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: EventListenerOptions | boolean): void {
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