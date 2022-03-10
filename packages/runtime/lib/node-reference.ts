import {BaseJayElement, JayComponent, JayElement} from "./element";

export type ReferencedElement = HTMLElement | JayComponent<any, any, any>;

// type computation to extract a type that describes the key of an object
// who's prop types are one parameter functions or a DOM event handler
type Func0 = () => void
type Func1 = (x: any) => void
type DOMeventHandler<E> = (((this: GlobalEventHandlers, ev: E) => any) | null)

// here the conditional type matches one parameter functions
// (which both zero and parameter functions match as zero parameter function is a subtype of one parameter function)
// we then match on zero param function and remove the keys using `never`.
// we then match on other cases for a DOM event handler.
// any other case (not a one param function or DOM event handler) are removed using `never`.
type EventHandlerKeys<T> = {
    [P in keyof T]:
    P extends string ?
        (T[P] extends Func1 ?
            (T[P] extends Func0 ? never : P) :
            T[P] extends DOMeventHandler<any> ? P : never) :
        never
}[keyof T];

// creates a type from an object, that only includes the event handler properties
type EventHandlersOf<T> = {
    [Q in EventHandlerKeys<T>]: T[Q]
};

export type JayEventListener<E, T> = (evt: E, dataContent: T) => void;
// create a function type that given a function event handler,
// creates a new type which accepts the event object type as a first param
// and the ViewState type as a second param
// (e: E) => void   -->  (e: E, vs: VS) => void
// (this: GlobalEventHandlers, e: E) => void  --> (e: E, vs: VS) => void
type JayComputedEventListener<Orig extends Function, VS> =
    Orig extends DOMeventHandler<any> ?
        ((e: Parameters<Orig>[0], dataContent: VS) => void) :
        ((evt: Orig, dataContent: VS) => void);

// creates a type that has only the event handlers or the original object,
// adding the ViewState param to each event handler function type.
type JayEventHandlersOf<ViewState, Element> = {
    [Property in keyof EventHandlersOf<Element>]: JayComputedEventListener<EventHandlersOf<Element>[Property], ViewState>;
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