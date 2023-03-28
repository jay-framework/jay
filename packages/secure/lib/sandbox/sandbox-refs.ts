import {
    HTMLElementCollectionProxy,
    HTMLElementProxy, HTMLNativeExec,
    JayComponentConstructor,
    JayEventHandler,
    JayNativeFunction, MountFunc, updateFunc
} from "jay-runtime";
import {
    addEventListenerMessage,
    JayEndpoint,
    JayPortMessageType,
    JPMMessage,
    removeEventListenerMessage
} from "../comm-channel";

export enum SandboxRefType {
    condition = 0,
    forEach = 1,
    comp = 2
}

export interface SandboxCondition<ViewState> {
    readonly type: SandboxRefType.condition
    condition: (viewState: ViewState) => boolean
    children: SandboxRefs<ViewState>
}

export interface SandboxComp<ViewState, Props> {
    readonly type: SandboxRefType.comp
    compCreator: JayComponentConstructor<Props>,
    getProps: (viewState: ViewState) => Props,
    refName: string
}

export interface SandboxForEach<ParentViewState, ItemViewState> {
    readonly type: SandboxRefType.forEach
    getItems: (viewState: ParentViewState) => ItemViewState[]
    matchBy: string
    children: SandboxRefs<ItemViewState>
}
export function sandboxForEach<ParentViewState, ItemViewState>(getItems: (viewState: ParentViewState) => ItemViewState[],
                                                               matchBy: string,
                                                               children: SandboxRefs<ItemViewState>): SandboxForEach<ParentViewState, ItemViewState> {
    return {getItems, matchBy, children, type: SandboxRefType.forEach}
}

export type SandboxRef<ViewState> = string |
    SandboxForEach<ViewState, any> |
    SandboxCondition<ViewState> |
    SandboxComp<ViewState, any>
export type SandboxRefs<ViewState> = SandboxRef<ViewState>[];

type Refs = Record<string, HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>>

interface SandboxBridgeElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
    refs: Refs
}

const proxyHandler = {
    get: function(target: RefImplementation<any>, prop, receiver) {
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

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void
    invoke: (type: string) => void
    update(newViewState: ViewState)
}

export class StaticRefImplementation<ViewState> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()

    constructor(
        private ref: string, private ep: JayEndpoint, private viewState: ViewState) {
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.ep.post(addEventListenerMessage(this.ref, type));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    invoke = (type: string) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: this.viewState,
                coordinate: this.ref
            })
    }
    $exec<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
        return null;
    }
    update(newViewState: ViewState) {
        this.viewState = newViewState
    }
}

export class DynamicRefImplementation<ViewState> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()

    constructor(
        private ref: string, private ep: JayEndpoint, private viewState: ViewState) {
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.ep.post(addEventListenerMessage(this.ref, type));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    invoke = (type: string) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: this.viewState,
                coordinate: this.ref
            })
    }
    find(predicate: (t: ViewState) => boolean): HTMLNativeExec<ViewState, any> {

    }
    map<ResultType>(handler: (element: HTMLNativeExec<ViewState, any>, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType> {

    }
    update(newViewState: ViewState) {
        this.viewState = newViewState
    }
}

class DataCollectionRef<ParentViewState, ItemViewState> {
    private items: Map<string, ItemViewState> = new Map();
    constructor(viewState: ParentViewState, private getItems: (viewState: ParentViewState) => ItemViewState[], private matchBy: string) {

    }

    update(viewState: ParentViewState) {
        let newItems: Map<string, ItemViewState> = new Map(this.getItems(viewState)
            .map(item => [item[this.matchBy], item]));

        this.items = newItems
    }
}

export function mkBridgeElement<ViewState>(viewState: ViewState, endpoint: JayEndpoint, refDefinitions: SandboxRefs<ViewState>): SandboxBridgeElement<ViewState> {
    let refs: Record<string, RefImplementation<ViewState>> = {};
    refDefinitions.forEach(refDefinition => {
        if (typeof refDefinition === 'string') {
            refs[refDefinition] = new Proxy(new StaticRefImplementation(refDefinition, endpoint, viewState), proxyHandler)
        }
        else if (refDefinition.type === SandboxRefType.forEach) {
            refDefinition.children.forEach(child => {
                if (typeof child === 'string') {
                    refs[child] = new Proxy(new DynamicRefImplementation(child, endpoint, viewState), proxyHandler)
                }
            })
        }
    })
    endpoint.onUpdate((inMessage: JPMMessage) => {
        switch (inMessage.type) {
            case JayPortMessageType.DOMEvent: {
                refs[inMessage.coordinate.split('/').slice(-1)[0]].invoke(inMessage.eventType)
                break;
            }
        }
    })
    const update = (newViewState: ViewState) => {
        Object.entries(refs).forEach(([key, ref]) => ref.update(newViewState))
    }
    return {
        refs: refs as any as Refs,
        update,
        mount: () => {},
        unmount: () => {}
    };
}