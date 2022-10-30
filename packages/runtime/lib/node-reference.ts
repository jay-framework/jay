import {BaseJayElement, JayElement, JayEventHandler, updateFunc, JayComponent} from "./element-types";

type Ref<ViewState> = {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void
    viewState: ViewState
    coordinate: string
}

interface RefCollection<ViewState>{
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void
    addRef(ref: Ref<ViewState>)
    removeRef(ref: Ref<ViewState>)
}

export class ReferencesManager {
    private refs: Record<string, Ref<any>> = {};
    private compRefs: Record<string, JayComponent<any, any, any>> = {};
    private refCollections: Record<string, RefCollection<any>> = {};

    constructor(dynamicRefs?: Array<string>) {
        dynamicRefs?.forEach(id => this.refCollections[id] = new ReferenceCollection())
    }

    getRefCollection(id: string, autoCreate: boolean = false): RefCollection<any> {
        if (!this.refCollections[id] && autoCreate)
            this.refCollections[id] = new ReferenceCollection();
        return this.refCollections[id];
    }

    addStaticRef(id: string, ref: Ref<any>) {
        this.refs[id] = ref;
    }

    addDynamicRef(id: string, ref: Ref<any>) {
        this.getRefCollection(id, true).addRef(ref);
    }

    removeDynamicRef(id: string, ref: Ref<any>) {
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
                let eventName = prop.substring(2);
                return (handler) => {
                    target.addEventListener(eventName, handler);
                }
            }
            if (prop.indexOf("$on") === 0) {
                let eventName = prop.substring(3);
                return (nativeHandler) => {
                    let regularHandler;
                    const handler = ({event, viewState, coordinate}) => {
                        const returnedEvent = nativeHandler({event, viewState, coordinate});
                        if (regularHandler)
                            regularHandler({event: returnedEvent, viewState, coordinate});
                    }
                    target.addEventListener(eventName, handler);
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
export function newReferenceProxy<ViewState>(ref) {
    return new Proxy(ref, proxyHandler);
}

class ReferenceCollection<ViewState> implements RefCollection<ViewState>{
    protected elements: Set<Ref<ViewState>> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.listeners.push({type, listener, options})
        this.elements.forEach(ref =>
          ref.addEventListener(type, listener, options))
    }

    addRef(ref: Ref<ViewState>) {
        this.elements.add(ref);
        this.listeners.forEach(listener =>
          ref.addEventListener(listener.type, listener.listener, listener.options))
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void {
        this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener);
        this.elements.forEach(ref =>
          ref.removeEventListener(type, listener, options))
    }

    removeRef(ref: Ref<ViewState>) {
        this.elements.delete(ref);
        this.listeners.forEach(listener =>
          ref.removeEventListener(listener.type, listener.listener, listener.options))
    }

    map<ResultType>(handler: (referenced: Ref<ViewState>, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType> {
        return [...this.elements].map(ref => handler(ref, ref.viewState, ref.coordinate));
    }

    find(predicate: (viewState: ViewState) => boolean) {
        for (let ref of this.elements)
            if (predicate(ref.viewState))
                return ref
    }

}

export function ComponentRef<ViewState>(comp: JayComponent<any, any, any>, viewState: ViewState, coordinate: string): [Ref<ViewState>, updateFunc<ViewState>] {
    let ref = new Proxy(comp, {
        get: function(target, prop, receiver) {
            if (typeof prop === 'string') {
                if (prop === 'addEventListener') {
                    return (eventName, handler) => {
                        target.addEventListener(eventName, ({event}) => {
                            return handler({event, viewState, coordinate})
                        });
                    }
                }
                if (prop === 'viewState')
                    return viewState
                if (prop === 'coordinate')
                    return coordinate
            }
            return target[prop];
        }
    }) as any as Ref<ViewState>;
    let update = (vs: ViewState) => {
        viewState = vs;
    }
    return [ref, update];
}

export class HTMLElementRefImpl<ViewState> implements Ref<ViewState>{
    private listeners = [];

    constructor(private readonly element: HTMLElement, public viewState: ViewState, public coordinate: string) {
        this.element = element;
        this.viewState = viewState
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return listener({event, viewState: this.viewState, coordinate: this.coordinate});
        }
        this.element.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler})
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any> | null, options?: EventListenerOptions | boolean): void {
        let index = this.listeners.findIndex(item => item.type === type && item.listener === listener)
        if (index > -1) {
            let item = this.listeners[index];
            this.listeners.splice(index, 1)
            this.element.removeEventListener(type, item.wrappedHandler, options)
        }
    }

    update = (newData: ViewState) => {
        this.viewState = newData;
    }

    $exec<T>(handler: (elem: Element, viewState: ViewState) => T): T {
        return handler(this.element, this.viewState);
    }
}