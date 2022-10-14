import {BaseJayElement, JayElement} from "./element-types";
import {
    DynamicReference,
    DynamicReferenceOperations,
    EventRegistrar,
    JayEventListener,
    ReferencedElement
} from "./node-reference-types";


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

    addStaticRef(id: string, ref: ElementReference<any, ReferencedElement> ) {
        this.staticRefs[id] = ref;
    }

    applyToElement<T, Refs>(element:BaseJayElement<T>): JayElement<T, Refs> {
        let enrichedDynamicRefs = Object.keys(this.dynamicRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(this.dynamicRefs[key])
            return enriched;
        }, {})
        let enrichedRefs = Object.keys(this.staticRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(this.staticRefs[key])
            return enriched;
        }, {})
        let refs = {...enrichedDynamicRefs, ...enrichedRefs} as Refs
        return {...element, refs};
    }
}

const proxyHandler = {
    get: function(target, prop, receiver) {
        if (typeof prop === 'string') {
            if (prop.indexOf("on") === 0) {
                let event = prop.substring(2);
                return (handler) => {
                    target.addEventListener(event, (ev, dataContent, coordinate) => handler(dataContent, coordinate));
                }
            }
            if (prop.indexOf("$on") === 0) {
                let event = prop.substring(3);
                return (nativeHandler) => {
                    let regularHandler;
                    const handler = (ev, dataContent, coordinate) => {
                        const eventData = nativeHandler(ev, dataContent, coordinate);
                        if (regularHandler)
                            regularHandler(eventData, dataContent, coordinate);
                    }
                    target.addEventListener(event, handler);
                    return {
                        then: (handler) => {
                            regularHandler = handler;
                        }
                    }
                }
            }
        }
        return target[prop];
    }
}
export function newReferenceProxy<ViewState, Element extends HTMLElement>(ref: EventRegistrar<ViewState>): DynamicReference<ViewState, Element> {
    return new Proxy(ref, proxyHandler) as DynamicReference<ViewState, Element>;
}

class DynamicReferenceInternal<ViewState, Element extends ReferencedElement> implements DynamicReferenceOperations<ViewState, Element> {
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
    private dataContent: ViewState;
    private listeners = [];

    constructor(public element: Element, dataContext: ViewState, private coordinate: string) {
        this.element = element;
        this.dataContent = dataContext
    }

    addEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.dataContent, this.coordinate);
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

    execNative<T>(handler: (elem: Element) => T): T {
        return handler(this.element);
    }
}