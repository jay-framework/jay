import {JayElement} from "./element";

export class ReferencesManager {
    private dynamicRefs = {};
    private staticRefs = {};

    getDynamic(id: string, autoCreate: boolean = false): DynamicReferenceInternal<any> | undefined {
        if (!this.dynamicRefs[id] && autoCreate)
            this.dynamicRefs[id] = new DynamicReferenceInternal();
        return this.dynamicRefs[id];
    }

    addDynamicRef(id: string, ref: ElementReference<any>) {
        this.getDynamic(id, true).addRef(ref);
    }

    removeDynamicRef(id: string, ref: ElementReference<any>) {
        this.getDynamic(id, true).removeRef(ref);
    }

    addStaticRef(id: string, ref: HTMLElement) {
        this.staticRefs[id] = ref;
    }

    applyToElement<T>(element: JayElement<T>): JayElement<T> {
        let enrichedRefs = Object.keys(this.dynamicRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(this.dynamicRefs[key])
            return enriched;
        }, {})
        return {...enrichedRefs, ...this.staticRefs, ...element};
    }
}

type GlobalEventHandlers<T> = {
    [Property in keyof GlobalEventHandlersEventMap as `on${Property}`]: (listener: JayEventListener<GlobalEventHandlersEventMap[Property], T>) => void;
}

interface ReferenceOperations<T> {
    one(): HTMLElement
    forEach(handler: (element: HTMLElement) => void)
    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: EventListenerOptions | boolean): void
}

export interface DynamicReference<T> extends GlobalEventHandlers<T>, ReferenceOperations<T>{}

const proxyHandler = {
    get: function (target, prop /*, receiver*/) {
        if (prop.indexOf("on") === 0 && prop !== 'one') {
            let event = prop.substring(2);
            return listener => target.addEventListener(event, listener);
        }
        return target[prop];
    }
}
export function newReferenceProxy<T>(ref: DynamicReferenceInternal<T>): DynamicReference<T> {
    return new Proxy(ref, proxyHandler) as DynamicReference<T>;
}

export class DynamicReferenceInternal<T> implements ReferenceOperations<T> {
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

    forEach(handler: (element: HTMLElement) => void) {
        this.elements.forEach(ref => handler(ref.element));
    }

    one(): HTMLElement {
        return this.elements.values().next().value.element;
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
    element: HTMLElement;
    private dataContent: T;
    private listeners = [];

    constructor(element: HTMLElement, dataContext: T) {
        this.element = element;
        this.dataContent = dataContext
    }

    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, T>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.dataContent);
        }
        this.element.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler})
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, T> | null, options?: EventListenerOptions | boolean): void {
        let index = this.listeners.findIndex(item => item.type === type && item.listener === listener)
        if (index > -1) {
            let item = this.listeners[index];
            this.listeners.splice(index, 1)
            this.element.removeEventListener(type, item.wrappedHandler, options)
        }
    }
    
    update = (newData: T) => {
        this.dataContent = newData;
    }
}