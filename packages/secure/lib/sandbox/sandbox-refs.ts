import {
    BaseJayElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    JayComponentConstructor,
    JayEventHandler,
    JayNativeFunction, MountFunc, updateFunc
} from "jay-runtime";
import {addEventListenerMessage, JayEndpoint, JayPortMessage, JayPortMessageType, JPMMessage} from "../comm-channel";

export interface SandboxCondition<ViewState> {
    condition: (viewState: ViewState) => boolean
    children: SandboxRefs<ViewState>
}

export interface SandboxComp<ViewState, Props> {
    compCreator: JayComponentConstructor<Props>,
    getProps: (viewState: ViewState) => Props,
    refName: string
}

export interface SandboxForEach<ParentViewState, ItemViewState> {
    getItems: (viewState: ParentViewState) => ItemViewState[]
    matchBy: string
    children: SandboxRefs<ItemViewState>
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
        if (listener) {
            this.ep.post(addEventListenerMessage(this.ref, type));
            this.listeners.set(type, listener)
        }
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        // todo add remove
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

export function mkBridgeElement<ViewState>(refDefinitions: SandboxRefs<ViewState>, endpoint: JayEndpoint, viewState: ViewState): SandboxBridgeElement<ViewState> {
    let refs: Record<string, RefImplementation<ViewState>> = {};
    refDefinitions.forEach(refDefinition => {
        if (typeof refDefinition === 'string') {
            refs[refDefinition] = new Proxy(new StaticRefImplementation(refDefinition, endpoint, viewState), proxyHandler)
        }
    })
    endpoint.onUpdate((inMessage: JPMMessage) => {
        switch (inMessage.type) {
            case JayPortMessageType.DOMEvent: {
                refs[inMessage.coordinate].invoke(inMessage.eventType)
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