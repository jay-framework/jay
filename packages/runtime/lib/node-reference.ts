import {
    Coordinate,
    JayComponent,
    JayEvent,
    JayEventHandler,
    JayEventHandlerWrapper,
    MountFunc,
    updateFunc,
} from './element-types';
import {
    ComponentCollectionProxy,
    GlobalJayEvents,
    HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget,
    HTMLElementProxy,
    HTMLElementProxyTarget,
} from './node-reference-types';
import {ManagedRefs} from "./references-manager.ts";

export type ReferenceTarget<ViewState> = HTMLElement | JayComponent<any, ViewState, any>;

export interface PrivateRef<ViewState, PublicRefAPI> {
    update: updateFunc<ViewState>;
    mount: MountFunc;
    unmount: MountFunc;
    viewState: ViewState;
    coordinate: Coordinate;
    getPublicAPI(): PublicRefAPI;
    set(referenced: ReferenceTarget<ViewState>): void;
    addEventListener<E extends Event>(
        type: string,
        handler: JayEventHandler<E, ViewState, any>,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<E extends Event>(
        type: string,
        handler: JayEventHandler<E, ViewState, any>,
        options?: EventListenerOptions | boolean,
    ): void;
}

// export function elemCollectionRef<ViewState, ElementType extends HTMLElement>(
//     refName: string,
// ): () => PrivateRef<ViewState, any> {
//     let { refManager } = currentConstructionContext();
//     let collRef = new HTMLElementCollectionRefImpl<ViewState, ElementType>();
//     refManager.add(refName, collRef);
//     return () => {
//         let { currData, coordinate, refManager } = currentConstructionContext();
//         let ref = new HTMLElementRefImpl<ViewState, ElementType>(
//             currData,
//             coordinate(refName),
//             refManager.eventWrapper,
//             collRef,
//         );
//         collRef.addRef(ref);
//         return ref;
//     };
// }
//
// export function elemRef<ViewState, ElementType extends HTMLElement>(refName: string):() => PrivateRef<ViewState, any> {
//     let { refManager } = currentConstructionContext();
//     let refs = new HTMLElementRefsImpl<ViewState, ElementType>();
//     refManager.add(refName, refs);
//     return () => {
//         let { currData, coordinate, refManager } = currentConstructionContext();
//         let ref = new HTMLElementRefImpl<ViewState, ElementType>(
//             currData,
//             coordinate(refName),
//             refManager.eventWrapper,
//             refs,
//         );
//         refs.addRef(ref);
//         return ref;
//     }
// }
//
// export function compCollectionRef<
//     ViewState,
//     ComponentType extends JayComponent<any, ViewState, any>,
// >(refName: string): () => PrivateRef<ViewState, any> {
//     let { refManager } = currentConstructionContext();
//     let collRef = new ComponentCollectionRefImpl<ViewState, ComponentType>();
//     refManager.add(refName, collRef);
//     return () => {
//         let { currData, coordinate, refManager } = currentConstructionContext();
//         let ref = new ComponentRefImpl<ViewState, ComponentType>(
//             currData,
//             coordinate(refName),
//             refManager.eventWrapper,
//             collRef,
//         );
//         collRef.addRef(ref);
//         return ref;
//     };
// }
//
// export function compRef<
//     ViewState,
//     ComponentType extends JayComponent<any, ViewState, any>,
// >(refName: string): () => PrivateRef<any, any> {
//     let { currData, coordinate, refManager } = currentConstructionContext();
//     let refs = new ComponentRefsImpl<ViewState, ComponentType>();
//     refManager.add(refName, refs)
//     return () => {
//         let { currData, coordinate, refManager } = currentConstructionContext();
//         let ref = new ComponentRefImpl<ViewState, ComponentType>(
//             currData,
//             coordinate(refName),
//             refManager.eventWrapper,
//             refs,
//         );
//         refs.addRef(ref);
//         return ref;
//     }
// }

export abstract class PrivateRefs<
    ViewState,
    PublicRefAPI,
    RefType extends PrivateRef<ViewState, PublicRefAPI>> {

    protected elements: Set<RefType> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, ViewState, any>,
        options?: boolean | AddEventListenerOptions,
    ): void {
        this.listeners.push({ type, listener, options });
        this.elements.forEach((ref) => ref.addEventListener(type, listener, options));
    }

    addRef(ref: RefType) {
        if (!this.elements.has(ref)) {
            this.elements.add(ref);
            this.listeners.forEach((listener) =>
                ref.addEventListener(listener.type, listener.listener, listener.options),
            );
        }
    }

    removeRef(ref: RefType) {
        this.elements.delete(ref);
        this.listeners.forEach((listener) =>
            ref.removeEventListener(listener.type, listener.listener, listener.options),
        );
    }

    removeEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, ViewState, any>,
        options?: EventListenerOptions | boolean,
    ): void {
        this.listeners = this.listeners.filter(
            (item) => item.type !== type || item.listener !== listener,
        );
        this.elements.forEach((ref) => ref.removeEventListener(type, listener, options));
    }

}

abstract class PrivateCollectionRefs<
    ViewState,
    PublicRefAPI,
    PublicCollectionRefAPI,
    RefType extends PrivateRef<ViewState, PublicRefAPI>,
> extends PrivateRefs<ViewState, PublicRefAPI, RefType>
{
    map<ResultType>(
        handler: (
            referenced: PublicRefAPI,
            viewState: ViewState,
            coordinate: Coordinate,
        ) => ResultType,
    ): Array<ResultType> {
        return [...this.elements].map((ref) =>
            handler(ref.getPublicAPI(), ref.viewState, ref.coordinate),
        );
    }

    find(predicate: (viewState: ViewState, c: Coordinate) => boolean): PublicRefAPI {
        for (let ref of this.elements)
            if (predicate(ref.viewState, ref.coordinate)) return ref.getPublicAPI();
    }

    abstract getPublicAPI(): PublicCollectionRefAPI;
}

export class HTMLElementCollectionRefImpl<
    ViewState,
    ElementType extends HTMLElement,
> extends PrivateCollectionRefs<
    ViewState,
    HTMLElementProxy<ViewState, ElementType>,
    HTMLElementCollectionProxy<ViewState, ElementType>,
    HTMLElementRefImpl<ViewState, ElementType>
> implements ManagedRefs {
    mkManagedRef(currData: any, coordinate: Coordinate, eventWrapper: JayEventHandlerWrapper<any, any, any>):
        HTMLElementRefImpl<ViewState, ElementType> {
        return new HTMLElementRefImpl<ViewState, ElementType>(currData, coordinate, eventWrapper, this)
    }
    getPublicAPI(): HTMLElementCollectionProxy<ViewState, ElementType> {
        return newHTMLElementPublicApiProxy<
            ViewState,
            HTMLElementCollectionProxyTarget<ViewState, ElementType>
        >(this);
    }
}

export class HTMLElementRefsImpl<
    ViewState,
    ElementType extends HTMLElement,
> extends PrivateRefs<
    ViewState,
    HTMLElementProxy<ViewState, ElementType>,
    HTMLElementRefImpl<ViewState, ElementType>
> implements HTMLElementProxyTarget<ViewState, ElementType>, ManagedRefs {
    mkManagedRef(currData: any, coordinate: Coordinate, eventWrapper: JayEventHandlerWrapper<any, any, any>) {
        return new HTMLElementRefImpl<ViewState, ElementType>(currData, coordinate, eventWrapper, this)
    }
    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return [...this.elements][0].getPublicAPI();
    }

    exec$<T>(handler: (elem: ElementType, viewState: ViewState) => T): Promise<T> {
        return [...this.elements][0].exec$(handler)
    }
}

export class ComponentRefsImpl<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
> extends PrivateRefs<
    ViewState,
    ComponentType,
    ComponentRefImpl<ViewState, ComponentType>
> implements ManagedRefs {
    mkManagedRef(currData: any, coordinate: Coordinate, eventWrapper: JayEventHandlerWrapper<any, any, any>) {
        return new ComponentRefImpl<ViewState, ComponentType>(currData, coordinate, eventWrapper, this);
    }
    getPublicAPI(): ComponentType {
        return [...this.elements][0].getPublicAPI();
    }
}

export class ComponentCollectionRefImpl<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
> extends PrivateCollectionRefs<
    ViewState,
    ComponentType,
    ComponentCollectionProxy<ViewState, ComponentType>,
    ComponentRefImpl<ViewState, ComponentType>
> implements ManagedRefs{
    mkManagedRef(currData: any, coordinate: Coordinate, eventWrapper: JayEventHandlerWrapper<any, any, any>) {
        return new ComponentRefImpl<ViewState, ComponentType>(currData, coordinate, eventWrapper, this);
    }
    getPublicAPI(): ComponentCollectionProxy<ViewState, ComponentType> {
        return newComponentCollectionPublicApiProxy<ViewState, ComponentType>(this);
    }
}

export abstract class RefImpl<
    ViewState,
    ElementType extends ReferenceTarget<ViewState>,
    PublicRefAPI,
    RefType extends PrivateRef<ViewState, PublicRefAPI>,
> implements PrivateRef<ViewState, PublicRefAPI>
{
    private listeners = [];
    protected element: ElementType;

    constructor(
        public viewState: ViewState,
        public coordinate: Coordinate,
        private eventWrapper: JayEventHandlerWrapper<any, ViewState, any>,
        private parentCollection?: PrivateRefs<
            ViewState,
            PublicRefAPI,
            RefType
        >,
    ) {
        this.viewState = viewState;
    }

    abstract getPublicAPI(): PublicRefAPI;

    set(referenced: ElementType | JayComponent<any, ViewState, any>): void {
        this.element = referenced as ElementType;
        this.listeners.forEach(({ type, wrappedHandler, options }) =>
            this.element.addEventListener(type, wrappedHandler, options),
        );
    }

    mount = () => {
        this.parentCollection?.addRef(this as any as RefType);
    };
    unmount = () => {
        this.parentCollection?.removeRef(this as any as RefType);
    };

    abstract formatEvent(event: any): JayEvent<any, ViewState>;

    addEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, ViewState, any>,
        options?: boolean | AddEventListenerOptions,
    ): void {
        let wrappedHandler = (event) => {
            return this.eventWrapper(listener, this.formatEvent(event));
        };
        this.element?.addEventListener(type, wrappedHandler, options);
        this.listeners.push({ type, listener, wrappedHandler, options });
    }

    removeEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, ViewState, any>,
        options?: EventListenerOptions | boolean,
    ): void {
        let index = this.listeners.findIndex(
            (item) => item.type === type && item.listener === listener,
        );
        if (index > -1) {
            let item = this.listeners[index];
            this.listeners.splice(index, 1);
            this.element?.removeEventListener(type, item.wrappedHandler, options);
        }
    }

    update = (newData: ViewState) => {
        this.viewState = newData;
    };
}

export class HTMLElementRefImpl<ViewState, ElementType extends HTMLElement>
    extends RefImpl<
        ViewState,
        ElementType,
        HTMLElementProxy<ViewState, ElementType>,
        HTMLElementRefImpl<ViewState, ElementType>
    >
    implements HTMLElementProxyTarget<ViewState, any>
{
    formatEvent(event: Event): JayEvent<Event, ViewState> {
        return { event, viewState: this.viewState, coordinate: this.coordinate };
    }

    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return newHTMLElementPublicApiProxy<
            ViewState,
            HTMLElementProxyTarget<ViewState, ElementType>
        >(this);
    }

    exec$<T>(handler: (elem: ElementType, viewState: ViewState) => T): Promise<T> {
        return new Promise((resolve, reject) => {
            try {
                resolve(handler(this.element, this.viewState));
            } catch (e) {
                reject(e);
            }
        });
    }
}

export class ComponentRefImpl<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
> extends RefImpl<
    ViewState,
    ComponentType,
    ComponentType,
    ComponentRefImpl<ViewState, ComponentType>
> {
    getFromComponent(prop) {
        return this.element[prop];
    }

    formatEvent(event: any): JayEvent<any, ViewState> {
        return { ...event, viewState: this.viewState, coordinate: this.coordinate };
    }

    getPublicAPI(): ComponentType {
        return newComponentPublicApiProxy<ViewState, ComponentType>(this) as any as ComponentType;
    }
}

export const EVENT_TRAP = (target, prop) => {
    if (typeof prop === 'string') {
        if (prop.indexOf('on') === 0) {
            let eventName = prop.substring(2);
            return (handler) => {
                target.addEventListener(eventName, handler);
            };
        }
        if (prop === 'addEventListener') return target.addEventListener.bind(target);
    }
    return false;
};

const EVENT$_TRAP = (target, prop) => {
    if (typeof prop === 'string') {
        if (prop.indexOf('on') === 0 && prop.at(-1) === '$') {
            let eventName = prop.slice(2, -1);
            return (nativeHandler) => {
                let regularHandler;
                const handler = ({ event, viewState, coordinate }) => {
                    const returnedEvent = nativeHandler({ event, viewState, coordinate });
                    if (regularHandler)
                        regularHandler({ event: returnedEvent, viewState, coordinate });
                };
                target.addEventListener(eventName, handler);
                return {
                    then: (handler) => {
                        regularHandler = handler;
                    },
                };
            };
        }
    }
    return false;
};

const DELEGATE_TO_COMP_TRAP = (target, prop) => {
    return target.getFromComponent(prop);
};

export const GetTrapProxy = (
    getTraps: Array<(target: any, p: string | symbol, receiver: any) => any>,
) => {
    return {
        get: function (target, prop, receiver) {
            let result;
            for (let getTrap of getTraps) {
                result = getTrap(target, prop, receiver);
                if (result) return result;
            }
            return target[prop];
        },
    };
};

const HTMLElementRefProxy = GetTrapProxy([EVENT$_TRAP, EVENT_TRAP]);

export function newHTMLElementPublicApiProxy<ViewState, T>(ref: T): T & GlobalJayEvents<ViewState> {
    return new Proxy(ref, HTMLElementRefProxy);
}

const ComponentRefProxy = GetTrapProxy([EVENT_TRAP, DELEGATE_TO_COMP_TRAP]);

export function newComponentPublicApiProxy<ViewState, C extends JayComponent<any, ViewState, any>>(
    ref: ComponentRefImpl<ViewState, C>,
): JayComponent<any, ViewState, any> {
    return new Proxy(ref, ComponentRefProxy);
}

const ComponentCollectionRefProxy = GetTrapProxy([EVENT_TRAP]);

export function newComponentCollectionPublicApiProxy<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
>(
    ref: ComponentCollectionRefImpl<ViewState, ComponentType>,
): ComponentCollectionProxy<ViewState, ComponentType> {
    return new Proxy(ref, ComponentCollectionRefProxy);
}