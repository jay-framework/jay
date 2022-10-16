import {BaseJayElement, JayElement} from "./element-types";
import {
    HTMLElementProxy,
    JayNativeEventHandler
} from "./node-reference-types";
import {JayComponent} from "../dist";

export type Referenced = HTMLElement | JayComponent<any, any, any>;

interface Ref<ViewState, Element extends Referenced> {
    addEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void
    removeRef?(ref: ElementReference<any, Element>)
}

interface RefCollection<ViewState, Element extends Referenced> extends Ref<ViewState, Element>{
    addRef(ref: Ref<ViewState, Element>)
    removeRef(ref: Ref<ViewState, Element>)
}

export class ReferencesManager {
    private refs: Record<string, Ref<any, Referenced>> = {};
    private refCollections: Record<string, RefCollection<any, Referenced>> = {};

    getRefCollection(id: string, autoCreate: boolean = false): RefCollection<any, Referenced> {
        if (!this.refCollections[id] && autoCreate)
            this.refCollections[id] = new HTMLElementProxyHandler();
        return this.refCollections[id];
    }

    addRef(id: string, ref: Ref<any, Referenced>, isStatic: boolean) {
        if (isStatic)
            this.refs[id] = ref;
        else
            this.getRefCollection(id, true).addRef(ref);
    }

    removeRef(id: string, ref: Ref<any, Referenced>) {
        this.getRefCollection(id, true).removeRef(ref);
    }

    applyToElement<T, Refs>(element:BaseJayElement<T>): JayElement<T, Refs> {
        let allRefs = {...this.refCollections, ...this.refs};
        let enrichedDynamicRefs = Object.keys(allRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(allRefs[key])
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
export function newReferenceProxy<ViewState, ElementType extends Referenced>(ref: Ref<ViewState, ElementType>):
  Ref<ViewState, ElementType> {
    return new Proxy(ref, proxyHandler) as Ref<ViewState, ElementType>;
}

class ReferenceCollection<ViewState, Element extends Referenced> implements RefCollection<ViewState, Element>{
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

class HTMLElementProxyHandler<ViewState, Element extends Referenced> implements RefCollection<ViewState, Element>{
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

    forEach(handler: (element: Element, viewState: ViewState, coordinate: string) => void) {
        this.elements.forEach(ref => ref.forEach(handler));
    }

    $exec(handler: (element: Element, viewState: ViewState) => void) {
        return [...this.elements].map(ref => ref.$exec(handler));
    }

    find(predicate: (viewState: ViewState) => boolean) {
        for (let elemRef of this.elements)
            if (elemRef.match(predicate))
                return elemRef
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

export class ElementReference<ViewState, Element extends Referenced> implements Ref<ViewState, Element>{
    private listeners = [];

    constructor(private readonly element: Element, private viewState: ViewState, private coordinate: string) {
        this.element = element;
        this.viewState = viewState
    }

    addEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener(event, this.viewState, this.coordinate);
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

    forEach(handler: (element: Element, viewState: ViewState, coordinate: string) => void) {
        handler(this.element, this.viewState, this.coordinate)
    }

    match(predicate: (t:ViewState) => boolean): boolean {
        return predicate(this.viewState);
    }
    
    update = (newData: ViewState) => {
        this.viewState = newData;
    }

    $exec<T>(handler: (elem: Element, viewState: ViewState) => T): T {
        return handler(this.element, this.viewState);
    }
}