import {addEventListenerMessage, JayPort, renderMessage, usePort} from "./comm-channel";
import {BasicViewState} from "../test/basic/secure/worker/basic.jay.html";
import {HTMLElementCollectionProxy, HTMLElementProxy, JayEventHandler, JayNativeFunction} from "jay-runtime";

class Ref {
    public port: JayPort;
    constructor(public ref: string, public compId: string) {

    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.port.post(this.compId, addEventListenerMessage(this.ref, type));
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
export function proxyRef(ref: string, compId: string): Ref {
    return new Ref(ref, compId);
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

export function workerStub(compId: string, viewState: any, refDefinitions: Ref[] = []) {
    let port: JayPort = usePort();
    port.post(compId, viewState);
    let refs = {};
    refDefinitions.forEach(refDef => {
        refDef.port = port;
        refs[refDef.ref] = mkRef(refDef);
    })
    return {
        dom: null,
        update: (newData: BasicViewState) => {
            port.post(compId, renderMessage(newData));
        },
        mount: () => {},
        unmount: () => {},
        refs
    }

}