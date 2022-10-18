import {BaseJayElement, JayElement} from "./element-types";
import {
    JayNativeEventHandler
} from "./node-reference-types";
import {JayComponent} from "../dist";

export type Referenced = HTMLElement | JayComponent<any, any, any>;
export enum RefType {
    HTMLElement,
    JayComponent
}

interface Ref<ViewState, Element extends Referenced> {
    addEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayNativeEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void
}

interface RefCollection<ViewState, Element extends Referenced> extends Ref<ViewState, Element>{
    addRef(ref: Ref<ViewState, Element>)
    removeRef(ref: Ref<ViewState, Element>)
}

export class ReferencesManager {
    private refs: Record<string, Ref<any, Referenced>> = {};
    private compRefs: Record<string, JayComponent<any, any, any>> = {};
    private refCollections: Record<string, RefCollection<any, Referenced>> = {};

    getRefCollection(id: string, autoCreate: boolean = false, refType: RefType = RefType.HTMLElement): RefCollection<any, Referenced> {
        if (!this.refCollections[id] && autoCreate)
            this.refCollections[id] = (refType === RefType.HTMLElement)?
              new HTMLElementRefCollectionOperations() :
              new ComponentRefCollectionOperations();
        return this.refCollections[id];
    }

    addStaticRef(id: string, ref: Ref<any, Referenced>) {
        this.refs[id] = ref;
    }

    addComponnetRef(id: string, comp: JayComponent<any, any, any>) {
        this.compRefs[id] = comp;
    }

    addDynamicRef(id: string, ref: Ref<any, Referenced>, refType: RefType) {
        this.getRefCollection(id, true, refType).addRef(ref);
    }

    removeRef(id: string, ref: Ref<any, Referenced>) {
        this.refCollections[id]?.removeRef(ref);
    }

    applyToElement<T, Refs>(element:BaseJayElement<T>): JayElement<T, Refs> {
        let allRefs = {...this.refCollections, ...this.refs};
        let enrichedDynamicRefs = Object.keys(allRefs).reduce((enriched, key) => {
            enriched[key] = newReferenceProxy(allRefs[key])
            return enriched;
        }, {})
        let refs = {...enrichedDynamicRefs, ...this.compRefs} as Refs
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
export function newReferenceProxy<ViewState, ElementType extends Referenced>(ref) {
    return new Proxy(ref, proxyHandler) as Ref<ViewState, ElementType>;
}

class ReferenceCollection<ViewState, Element extends Referenced> implements RefCollection<ViewState, Element>{
    protected elements: Set<ElementReference<ViewState, Element>> = new Set();
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

class HTMLElementRefCollectionOperations<ViewState, ElementType extends HTMLElement>
  extends ReferenceCollection<ViewState, ElementType> {

    $exec<ResultType>(handler: (element: ElementType, viewState: ViewState) => ResultType): Array<ResultType> {
        return [...this.elements].map(ref => ref.$exec(handler));
    }

    find(predicate: (viewState: ViewState) => boolean) {
        for (let elemRef of this.elements)
            if (elemRef.match(predicate))
                return elemRef
    }
}

class ComponentRefCollectionOperations<ViewState, ElementType extends HTMLElement>
  extends ReferenceCollection<ViewState, ElementType> {

    map<ResultType>(handler: (element: Element, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType> {
        return [...this.elements].map(ref => ref.map(handler));
    }

    find(predicate: (viewState: ViewState) => boolean) {
        for (let elemRef of this.elements)
            if (elemRef.match(predicate))
                return elemRef
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

    map<ResultType>(handler: (element: Element, viewState: ViewState, coordinate: string) => ResultType): ResultType {
        return handler(this.element, this.viewState, this.coordinate)
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