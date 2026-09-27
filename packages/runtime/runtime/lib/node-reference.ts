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
import { ManagedRefs } from './references-manager';

export type ReferenceTarget<ViewState> = Element | JayComponent<any, ViewState, any>;

export interface PrivateRef<ViewState, PublicRefAPI> {
    update: updateFunc<ViewState>;
    mount: MountFunc;
    unmount: MountFunc;
    viewState: ViewState;
    coordinate: Coordinate;
    getPublicAPI(): PublicRefAPI;
    getBoundElement(): ReferenceTarget<ViewState>;
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

export abstract class PrivateRefs<
    ViewState,
    PublicRefAPI,
    RefType extends PrivateRef<ViewState, PublicRefAPI>,
> {
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

    // DL#198 Design D — the region's free refs are inert carriers: nobody subscribes region-side (free
    // refs are not in the region's contract), they just hold the bound DOM node, the region viewState and
    // the region-relative coordinate. The page-side FreeReferenceManager reads these to mint a
    // page-context RefImpl per node at region mount.
    getCarriers(): Array<{ element: ReferenceTarget<ViewState>; viewState: ViewState; coordinate: Coordinate }> {
        return [...this.elements].map((ref) => ({
            element: ref.getBoundElement(),
            viewState: ref.viewState,
            coordinate: ref.coordinate,
        }));
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
> extends PrivateRefs<ViewState, PublicRefAPI, RefType> {
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

export class HTMLElementCollectionRefImpl<ViewState, ElementType extends HTMLElement>
    extends PrivateCollectionRefs<
        ViewState,
        HTMLElementProxy<ViewState, ElementType>,
        HTMLElementCollectionProxy<ViewState, ElementType>,
        HTMLElementRefImpl<ViewState, ElementType>
    >
    implements ManagedRefs
{
    mkManagedRef(
        currData: any,
        coordinate: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ): HTMLElementRefImpl<ViewState, ElementType> {
        return new HTMLElementRefImpl<ViewState, ElementType>(
            currData,
            coordinate,
            eventWrapper,
            this,
        );
    }
    getPublicAPI(): HTMLElementCollectionProxy<ViewState, ElementType> {
        return newHTMLElementPublicApiProxy<
            ViewState,
            HTMLElementCollectionProxyTarget<ViewState, ElementType>
        >(this);
    }
}

export class HTMLElementRefsImpl<ViewState, ElementType extends HTMLElement>
    extends PrivateRefs<
        ViewState,
        HTMLElementProxy<ViewState, ElementType>,
        HTMLElementRefImpl<ViewState, ElementType>
    >
    implements HTMLElementProxyTarget<ViewState, ElementType>, ManagedRefs
{
    mkManagedRef(
        currData: any,
        coordinate: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ) {
        return new HTMLElementRefImpl<ViewState, ElementType>(
            currData,
            coordinate,
            eventWrapper,
            this,
        );
    }
    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return newHTMLElementPublicApiProxy<
            ViewState,
            HTMLElementProxyTarget<ViewState, ElementType>
        >(this);
    }

    exec$<T>(handler: (elem: ElementType, viewState: ViewState) => T): Promise<T> {
        const first = [...this.elements][0];
        if (!first) return Promise.resolve(undefined);
        return first.exec$(handler);
    }
}

export class ComponentRefsImpl<ViewState, ComponentType extends JayComponent<any, ViewState, any>>
    extends PrivateRefs<ViewState, ComponentType, ComponentRefImpl<ViewState, ComponentType>>
    implements ManagedRefs
{
    // DL#198 Design D — the page creates a FreeReferenceManager per region (page scope → page
    // eventWrapper baked in) and registers it here before the region renders. Its public API is the
    // overlay for free-ref members: a page subscription made in the page constructor (before the region
    // mounts) lands on this manager's aggregate and is replayed onto the page-context RefImpl the driver
    // mints at region mount. See `BaseReferencesManager.driveFreeRefsFrom`.
    private freeRefManager?: { getPublicAPI(): any };

    setFreeRefManager(freeRefManager: { getPublicAPI(): any }) {
        this.freeRefManager = freeRefManager;
    }

    getInstance() {
        return [...this.elements][0]?.getPublicAPI();
    }

    // DL#198 Design D — overlay lookup. A component member (contract ref / method / event) resolves
    // against the region instance and wins. Anything the instance does not define falls through to the
    // page FreeReferenceManager's public API (the free refs). An unknown member resolves to undefined so
    // existence checks stay honest — a pre-render typo is not a truthy deferring proxy.
    member(prop: string | symbol) {
        const instance = this.getInstance();
        if (instance) {
            const value = instance[prop];
            if (value !== undefined) return value;
        }
        if (typeof prop === 'string' && this.freeRefManager) {
            const freeApi = this.freeRefManager.getPublicAPI();
            if (prop in freeApi) return freeApi[prop];
        }
        return undefined;
    }

    mkManagedRef(
        currData: any,
        coordinate: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ) {
        return new ComponentRefImpl<ViewState, ComponentType>(
            currData,
            coordinate,
            eventWrapper,
            this,
        );
    }
    getPublicAPI(): ComponentType {
        return newComponentPublicApiProxy<ViewState, ComponentType>(this) as any as ComponentType;
    }
}

export class ComponentCollectionRefImpl<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
>
    extends PrivateCollectionRefs<
        ViewState,
        ComponentType,
        ComponentCollectionProxy<ViewState, ComponentType>,
        ComponentRefImpl<ViewState, ComponentType>
    >
    implements ManagedRefs
{
    mkManagedRef(
        currData: any,
        coordinate: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ) {
        return new ComponentRefImpl<ViewState, ComponentType>(
            currData,
            coordinate,
            eventWrapper,
            this,
        );
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
> implements PrivateRef<ViewState, PublicRefAPI> {
    private listeners = [];
    protected element: ElementType;

    constructor(
        public viewState: ViewState,
        public coordinate: Coordinate,
        private eventWrapper: JayEventHandlerWrapper<any, ViewState, any>,
        private parentCollection?: PrivateRefs<ViewState, PublicRefAPI, RefType>,
    ) {
        this.viewState = viewState;
    }

    abstract getPublicAPI(): PublicRefAPI;

    // DL#198 Design D — the page-side FreeReferenceManager driver reaches the DOM node (or component
    // instance) a region free ref is bound to, so it can mint a page-context RefImpl over the same node.
    getBoundElement(): ElementType {
        return this.element;
    }

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
        if (!this.element) return Promise.resolve(undefined);
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
        return newComponentInCollectionPublicApiProxy<ViewState, ComponentType>(
            this,
        ) as any as ComponentType;
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

// const GET_COMP_INSTANCE_TRAP = (target: ComponentRefsImpl<any, any>, prop) => {
//     return (prop === 'comp') && target.getInstance();
// };

const DELEGATE_REF_TO_COMP_TRAP = (target: ComponentRefImpl<any, any>, prop) => {
    // Delegate a member read to the underlying region component instance. Returns undefined for a genuine
    // non-member (GetTrapProxy then reads target[prop]).
    return target.getFromComponent(prop);
};

const DELEGATE_REFS_TO_COMP_TRAP = (target: ComponentRefsImpl<any, any>, prop) => {
    // DL#198 Design D — overlay lookup: region instance members first, then the page FreeReferenceManager's
    // public API (free refs). See ComponentRefsImpl.member.
    return target.member(prop);
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

const ComponentRefProxy = GetTrapProxy([EVENT_TRAP, DELEGATE_REFS_TO_COMP_TRAP]);

export function newComponentPublicApiProxy<ViewState, C extends JayComponent<any, ViewState, any>>(
    ref: ComponentRefsImpl<ViewState, C>,
): JayComponent<any, ViewState, any> {
    return new Proxy(ref, ComponentRefProxy);
}

const ComponentInCollectionRefProxy = GetTrapProxy([EVENT_TRAP, DELEGATE_REF_TO_COMP_TRAP]);

export function newComponentInCollectionPublicApiProxy<
    ViewState,
    C extends JayComponent<any, ViewState, any>,
>(ref: ComponentRefImpl<ViewState, C>): JayComponent<any, ViewState, any> {
    return new Proxy(ref, ComponentInCollectionRefProxy);
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
