import {JayEventHandler, JayEventHandlerWrapper} from "jay-runtime";
import * as React from "react";

type eventType = string;
type refName = string;
export type JayReactElementEvents = Record<eventType, JayEventHandler<any, any, any>>;
export type JayReactEvents = Record<refName, JayReactElementEvents>;

function uppercaseThirdLetter(str) {
    if (str.length >= 3 && str.substring(0, 2) === "on") {
        return str.substring(0, 2) + str[2].toUpperCase() + str.substring(3);
    } else {
        return str;
    }
}
export function eventsFor<ViewState>(coordinate: string[], viewState: ViewState, events: JayReactElementEvents,
                                     eventsWrapper?: JayEventHandlerWrapper<any, any, any>) {
    const reactCallbacks = {};
    Object.entries(events).forEach( event => {
        const name: string = uppercaseThirdLetter(event[0])
        const handler = event[1];
        reactCallbacks[name] = (reactEvent: React.SyntheticEvent) => {
            const jayEvent = {viewState, coordinate, event: reactEvent.nativeEvent};
            if (eventsWrapper)
                eventsWrapper(handler, jayEvent)
            else
                handler({viewState, coordinate, event: reactEvent.nativeEvent});
        }
    })
    return reactCallbacks
}


function refRecorder() {
    const ref = {};
    const proxy = new Proxy({}, {
        get(target, prop, receiver) {
            return (arg) =>
                ref[prop] = arg;
        }
    });

    return [proxy, ref]
}

const GET_REFS = Symbol();
export function refsRecorder<Refs>(): Refs {
    const refs = {}
    return new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if (p === GET_REFS)
                return Object.fromEntries(Object.entries(refs).map(([key, value]) => [key, value[1]]))
            else
                return (refs[p] && refs[p][0]) || (refs[p] = refRecorder())[0];
        }
    }) as Refs;
}

export function getReactEvents<Refs>(refs: Refs): JayReactEvents {
    if (refs)
        return refs[GET_REFS];
    else
        return {}
}