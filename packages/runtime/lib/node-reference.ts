import {BaseJayElement, JayElement} from "./element-types";
import {
    HTMLElementProxy,
    JayNativeEventHandler
} from "./node-reference-types";



export class ReferencesManager {
    private htmlElementsRefs: Record<string, HTMLElementProxyHandler<any, HTMLElement>> = {};

    getElementRefs(id: string, autoCreate: boolean = false): HTMLElementProxyHandler<any, HTMLElement> | undefined {
        if (!this.htmlElementsRefs[id] && autoCreate)
            this.htmlElementsRefs[id] = new HTMLElementProxyHandler();
        return this.htmlElementsRefs[id];
    }

    addHtmlElementRef(id: string, ref: ElementReference<any, HTMLElement>) {
        this.getElementRefs(id, true).addRef(ref);
    }

    removeHtmlElementRef(id: string, ref: ElementReference<any, HTMLElement>) {
        this.getElementRefs(id, true).removeRef(ref);
    }

    applyToElement<T, Refs>(element:BaseJayElement<T>): JayElement<T, Refs> {
        let enrichedDynamicRefs = Object.keys(this.htmlElementsRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(this.htmlElementsRefs[key])
            return enriched;
        }, {})
        let refs = {...enrichedDynamicRefs} as Refs
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
export function newReferenceProxy<ViewState, ElementType extends HTMLElement>(ref: HTMLElementProxyHandler<ViewState, ElementType>):
  HTMLElementProxy<ViewState, ElementType> {
    return new Proxy(ref, proxyHandler) as HTMLElementProxy<ViewState, ElementType>;
}

class HTMLElementProxyHandler<ViewState, Element extends HTMLElement> {
    private elements: Set<ElementReference<ViewState, Element>> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: boolean | AddEventListenerOptions): void {
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

    removeEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void {
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

export class ElementReference<ViewState, Element extends HTMLElement> {
    private dataContent: ViewState;
    private listeners = [];

    constructor(public element: Element, dataContext: ViewState, private coordinate: string) {
        this.element = element;
        this.dataContent = dataContext
    }

    addEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.dataContent, this.coordinate);
        }
        this.element.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler})
    }

    removeEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void {
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