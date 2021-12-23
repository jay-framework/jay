import {BaseJayElement, JayComponent, JayElement} from "./element";

type ReferencedElement = HTMLElement | JayComponent<any, any, any>;

export type JayEventListener<E, T> = (evt: E, dataContent: T) => void;

type FilteredKeys<T, U> = { [P in keyof T]: P extends string ? T[P] extends U ? P : never : never}[keyof T];

export interface JayCustomEvent {}
type EventHandler = (e: Event | JayCustomEvent) => void;

type EventHandlersOf<T> = {
    [Q in FilteredKeys<T, EventHandler>]: T[Q]
};

type JayEventHandlersOf<ViewState, Element> = {
    [Property in keyof EventHandlersOf<Element>]: JayEventListener<EventHandlersOf<Element>[Property], ViewState>;
}

interface ReferenceOperations<ViewState, Element> {
    filter(predicate: (t:ViewState) => boolean): Element
    forEach(handler: (element: Element) => void): void
    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: EventListenerOptions | boolean): void
}

export type DynamicReference<ViewState, Element extends ReferencedElement> = JayEventHandlersOf<ViewState, Element> & ReferenceOperations<ViewState, Element>

export class ReferencesManager {
    private dynamicRefs = {};
    private staticRefs = {};

    getDynamic(id: string, autoCreate: boolean = false): DynamicReferenceInternal<any, ReferencedElement> | undefined {
        if (!this.dynamicRefs[id] && autoCreate)
            this.dynamicRefs[id] = new DynamicReferenceInternal();
        return this.dynamicRefs[id];
    }

    addDynamicRef(id: string, ref: ElementReference<any, ReferencedElement>) {
        this.getDynamic(id, true).addRef(ref);
    }

    removeDynamicRef(id: string, ref: ElementReference<any, ReferencedElement>) {
        this.getDynamic(id, true).removeRef(ref);
    }

    addStaticRef(id: string, ref: ReferencedElement ) {
        this.staticRefs[id] = ref;
    }

    applyToElement<T, Refs>(element:BaseJayElement<T>): JayElement<T, Refs> {
        let enrichedRefs = Object.keys(this.dynamicRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(this.dynamicRefs[key])
            return enriched;
        }, {})
        let refs = {...enrichedRefs, ...this.staticRefs} as Refs 
        return {...element, refs};
    }
}

const proxyHandler = {
    set: function(target, prop, value): boolean {
        if (prop.indexOf("on") === 0) {
            let event = prop.substring(2);
            target.addEventListener(event, value);
            return true;
        }
        else
            target[prop] = value;
    }
}
export function newReferenceProxy<ViewState, Element extends HTMLElement>(ref: DynamicReferenceInternal<ViewState, Element>): DynamicReference<ViewState, Element> {
    return new Proxy(ref, proxyHandler) as DynamicReference<ViewState, Element>;
}

export class DynamicReferenceInternal<ViewState, Element extends ReferencedElement> implements ReferenceOperations<ViewState, Element> {
    private elements: Set<ElementReference<ViewState, Element>> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: boolean | AddEventListenerOptions): void {
        this.listeners.push({type, listener, options})
        this.elements.forEach(ref =>
            ref.addEventListener(type, listener, options))
    }

    addRef(ref: ElementReference<ViewState, Element>) {
        this.elements.add(ref);
        this.listeners.forEach(listener =>
            ref.addEventListener(listener.type, listener.listener, listener.options))
    }

    forEach(handler: (element: Element) => void) {
        this.elements.forEach(ref => handler(ref.element));
    }

    filter(predicate: (t:ViewState) => boolean): Element {
        for (let elemRef of this.elements)
            if (elemRef.match(predicate))
                return elemRef.element
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: EventListenerOptions | boolean): void {
        this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener);
        this.elements.forEach(ref =>
            ref.removeEventListener(type, listener, options))
    }

    removeRef(ref: ElementReference<ViewState, Element>) {
        this.elements.delete(ref);
        this.listeners.forEach(listener =>
            ref.removeEventListener(listener.type, listener.listener, listener.options))
    }
    
}

export class ElementReference<ViewState, Element extends ReferencedElement> {
    element: Element;
    private dataContent: ViewState;
    private listeners = [];

    constructor(element: Element, dataContext: ViewState) {
        this.element = element;
        this.dataContent = dataContext
    }

    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.dataContent);
        }
        this.element.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler})
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: EventListenerOptions | boolean): void {
        let index = this.listeners.findIndex(item => item.type === type && item.listener === listener)
        if (index > -1) {
            let item = this.listeners[index];
            this.listeners.splice(index, 1)
            this.element.removeEventListener(type, item.wrappedHandler, options)
        }
    }

    match(predicate: (t:ViewState) => boolean): boolean {
        return predicate(this.dataContent);
    }
    
    update = (newData: ViewState) => {
        this.dataContent = newData;
    }
}