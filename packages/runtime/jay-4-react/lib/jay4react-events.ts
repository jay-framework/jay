import { Coordinate, JayEventHandler, JayEventHandlerWrapper } from 'jay-runtime';
import * as React from 'react';

type eventType = string;
type refName = string;
export type JayReactElementEvents = Record<eventType, JayEventHandler<any, any, any>>;
export type JayReactEvents = Record<refName, JayReactElementEvents>;

function uppercaseThirdLetter(str) {
    if (str.length >= 3 && str.substring(0, 2) === 'on') {
        return str.substring(0, 2) + str[2].toUpperCase() + str.substring(3);
    } else {
        return str;
    }
}

const SPECIAL_JAY_TO_REACT_EVENT_NAMES = {
    onkeydown: 'onKeyDown',
    ondblclick: 'onDoubleClick',
};

function jayToReactEventName(jayEventName: string) {
    return SPECIAL_JAY_TO_REACT_EVENT_NAMES[jayEventName] || uppercaseThirdLetter(jayEventName);
}

export class EventsContext {
    constructor(
        public readonly viewState: object,
        public readonly coordinateBase: Coordinate,
        public readonly eventsWrapper: JayEventHandlerWrapper<any, any, any>,
        private reactEvents: JayReactEvents,
    ) {}

    coordinate(refName: string): Coordinate {
        return [...this.coordinateBase, refName];
    }
    events(refName: string): JayReactElementEvents {
        return this.reactEvents[refName];
    }

    child(id: string, viewState: object) {
        return new EventsContext(
            viewState,
            [...this.coordinateBase, id],
            this.eventsWrapper,
            this.reactEvents,
        );
    }

    withViewState(viewState: object) {
        return new EventsContext(
            viewState,
            this.coordinateBase,
            this.eventsWrapper,
            this.reactEvents,
        );
    }
}

export function eventsFor<ViewState>(eventsContext: EventsContext, refName: string) {
    const reactCallbacks = {};
    const events = eventsContext.events(refName);
    Object.entries(events).forEach((event) => {
        const name: string = jayToReactEventName(event[0]);
        const handler = event[1];
        reactCallbacks[name] = (reactEvent: React.SyntheticEvent) => {
            const coordinate = eventsContext.coordinate(refName);
            const viewState = eventsContext.viewState;
            const eventsWrapper = eventsContext.eventsWrapper;
            const jayEvent = {
                viewState,
                coordinate,
                event: reactEvent?.nativeEvent ? reactEvent.nativeEvent : reactEvent,
            };
            if (eventsWrapper) eventsWrapper(handler, jayEvent);
            else handler(jayEvent);
        };
    });
    return reactCallbacks;
}

function refRecorder() {
    const ref = {};
    const proxy = new Proxy(
        {},
        {
            get(target, prop, receiver) {
                return (arg) => (ref[prop] = arg);
            },
        },
    );

    return [proxy, ref];
}

export function refsRecorder<Refs>(
    eventWrapper?: JayEventHandlerWrapper<any, any, any>,
): [Refs, EventsContext] {
    const refs = {};
    const events: JayReactEvents = {};
    const _0 = new Proxy(
        {},
        {
            get(target: {}, p: string | symbol, receiver: any): any {
                if (refs[p]) {
                    return refs[p];
                } else {
                    const [proxy, ref] = refRecorder();
                    events[p as string] = ref;
                    return (refs[p] = proxy);
                }
            },
        },
    ) as Refs;
    const _1 = new EventsContext(null, [], eventWrapper, events);
    return [_0, _1];
}
