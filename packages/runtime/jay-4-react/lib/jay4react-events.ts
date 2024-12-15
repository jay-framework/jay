import {JayEventHandler} from "jay-runtime";

type eventType = string;
type refName = string;
export type JayReactElementEvents = Array<[eventType, JayEventHandler<any, any, any>]>;
export type JayReactEvents = Array<[refName, JayReactElementEvents]>;

export function eventsFor<ViewState>(coordinate: string[], viewState: ViewState, events: JayReactElementEvents) {
    return {}
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

export function refsRecorder<Refs>(): Refs {
    const refs = {}
    return new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            return (refs[p] && refs[p][0]) || (refs[p] = refRecorder())[0];
        }
    }) as Refs;
}