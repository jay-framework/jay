import {
    addEventListenerMessage,
    JayEndpoint,
    JayPortMessageType,
    JPMMessage,
    renderMessage
} from "../comm-channel";
import {
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    JayEventHandler,
    JayNativeFunction,
    useContext
} from "jay-runtime";
import {SANDBOX_MARKER} from "./sandbox-context";
import {CONSTRUCTION_CONTEXT_MARKER} from "jay-runtime/dist/context";
import {COMPONENT_CONTEXT} from "jay-component";

class Ref {
    public ep: JayEndpoint;
    private listeners = new Map<string, JayEventHandler<any, any, any>>()
    constructor(public ref: string) {

    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        if (listener) {
            this.ep.post(addEventListenerMessage(this.ref, type));
            this.listeners.set(type, listener)
        }
        // todo add remove
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        // todo add remove
    }
    invoke(type: string, eventData: any) {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: undefined,
                coordinate: this.ref
            })
    }
    $exec<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
        return null;
    }
}

// interface RefCollection {
//     addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void
//     removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void
// }
//
export function proxyRef(ref: string): Ref {
    return new Ref(ref);
}

// export function proxyRefs(ref: string): ProxyRefDefinition {
//     return [ref, true]
// }
//
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


function mkRef(refDef: Ref): HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> {
    return new Proxy(refDef, proxyHandler);
}

export function elementBridge(viewState: any, refDefinitions: Ref[] = []) {
    let parentContext = useContext(SANDBOX_MARKER);
    let {reactive} = useContext(COMPONENT_CONTEXT);
    let ep = parentContext.port.getEndpoint(parentContext.compId, parentContext.coordinate)
    let refs = {};
    ep.post(viewState);
    ep.onUpdate((inMessage: JPMMessage) => {
        switch (inMessage.type) {
            case JayPortMessageType.DOMEvent: {
                reactive.batchReactions(() => {
                    refs[inMessage.coordinate].invoke(inMessage.eventType, inMessage.eventData)
                })
                break;
            }
        }
        console.log(inMessage)
    })
    refDefinitions.forEach(refDef => {
        refDef.ep = ep;
        refs[refDef.ref] = mkRef(refDef);
    })
    return {
        dom: null,
        update: (newData: any) => {
            ep.post(renderMessage(newData));
        },
        mount: () => {},
        unmount: () => {},
        refs
    }

}