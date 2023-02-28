import {addEventListenerMessage, JayEndpoint, JayPort, renderMessage, useWorkerPort} from "./comm-channel";
import {BasicViewState} from "../test/basic/secure/worker/basic.jay.html";
import {HTMLElementCollectionProxy, HTMLElementProxy, JayEventHandler, JayNativeFunction} from "jay-runtime";

class Ref {
    public ep: JayEndpoint;
    constructor(public ref: string) {

    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.ep.post(addEventListenerMessage(this.ref, type));
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {

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

export function elementBridge(compId: number, viewState: any, refDefinitions: Ref[] = []) {
    let port: JayPort = useWorkerPort();
    let ep = port.getEndpoint(compId)
    ep.post(viewState);
    let refs = {};
    refDefinitions.forEach(refDef => {
        refDef.ep = ep;
        refs[refDef.ref] = mkRef(refDef);
    })
    return {
        dom: null,
        update: (newData: BasicViewState) => {
            ep.post(renderMessage(newData));
        },
        mount: () => {},
        unmount: () => {},
        refs
    }

}