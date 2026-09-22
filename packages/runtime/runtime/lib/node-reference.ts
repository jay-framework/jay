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
    // DL#194 Fork C: a Tier 3 instance filled with `<override slot="X">` content exposes the slot
    // content's (parent-owned) refs at `refs.<instance>.<slot>.<ref>` alongside the child component's
    // own refs at `refs.<instance>.<childRef>`. When the instance ref name collides with a pre-seeded
    // slot ref manager (see BaseReferencesManager.mkRefsOfType), that manager is attached here.
    private slotRefManager?: { getPublicAPI(): any };

    setSlotRefManager(slotRefManager: { getPublicAPI(): any }) {
        this.slotRefManager = slotRefManager;
    }

    getSlotRef(slotName: string): any {
        if (!this.slotRefManager) return undefined;
        const api = this.slotRefManager.getPublicAPI();
        return api ? api[slotName] : undefined;
    }

    getInstance() {
        return [...this.elements][0]?.getPublicAPI();
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
    // DL#193 Phase 3: a pure (Tier 2) composite forwards its named inner child-component refs
    // (e.g. `<jay:Counter ref="cta">`). When the composite itself is repeated at the usage site,
    // the forwarded ref rides this component collection as `refs.<collection>.<inner>` (e.g.
    // `refs.cards.cta`). Handlers registered on that aggregate are replayed onto instances added
    // after registration, keyed by the inner ref name — mirroring PrivateRefs.addEventListener.
    private forwardedInnerListeners = new Map<
        string,
        Array<{ type: string; listener: any; options?: boolean | AddEventListenerOptions }>
    >();

    // DL#194 Fork C, under repetition: when a Tier 3 instance filled with `<override slot="X">` is
    // itself placed under a parent forEach, the instance ref becomes a component collection. The
    // parent-owned slot content's refs still ride at `refs.<collection>.<slot>.<ref>` (aggregated as
    // element collections). The pre-seeded slot ref manager (see BaseReferencesManager.mkRefsOfType)
    // is attached here — mirroring ComponentRefsImpl.setSlotRefManager for the non-repeated case.
    private slotRefManager?: { getPublicAPI(): any };

    setSlotRefManager(slotRefManager: { getPublicAPI(): any }) {
        this.slotRefManager = slotRefManager;
    }

    getSlotRef(slotName: string): any {
        if (!this.slotRefManager) return undefined;
        const api = this.slotRefManager.getPublicAPI();
        return api ? api[slotName] : undefined;
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

    addRef(ref: ComponentRefImpl<ViewState, ComponentType>) {
        const isNew = !this.elements.has(ref);
        super.addRef(ref);
        // Replay forwarded inner-ref listeners onto the newly-added instance's inner ref.
        if (isNew && this.forwardedInnerListeners.size > 0) {
            const api: any = ref.getPublicAPI();
            this.forwardedInnerListeners.forEach((listeners, innerName) => {
                const innerRef = api?.[innerName];
                if (innerRef)
                    listeners.forEach(({ type, listener, options }) =>
                        innerRef.addEventListener(type, listener, options),
                    );
            });
        }
    }

    /**
     * DL#193 Phase 3: does the collected component expose an inner ref named `innerName`? Decided
     * from the first live instance's public API. Used by the collection proxy to distinguish a
     * forwarded inner ref (`refs.cards.cta`) from a collection method / typo.
     */
    hasForwardedInnerRef(innerName: string): boolean {
        const first = [...this.elements][0];
        if (!first) return false;
        // Use property access (goes through the ComponentInCollection get-trap →
        // getFromComponent → the instance's forwarded ref), NOT the `in` operator, which
        // bypasses the get-trap and would test the raw ComponentRefImpl (no forwarded ref).
        const api: any = first.getPublicAPI();
        return !!api && !!api[innerName];
    }

    /**
     * DL#193 Phase 3: aggregate the forwarded inner ref `innerName` across all instances into a
     * collection proxy (`CounterRefs<CardViewState>`): `onXxx`/`addEventListener` fan out to every
     * instance's inner ref (carrying that instance's viewState — no re-basing) and are replayed for
     * instances added later; `find(pred)`/`map(h)` iterate the live instances.
     */
    getForwardedInnerRef(innerName: string): any {
        const currentInnerRefs = () =>
            [...this.elements]
                .map((ref) => ({
                    inner: (ref.getPublicAPI() as any)?.[innerName],
                    viewState: ref.viewState,
                    coordinate: ref.coordinate,
                }))
                .filter((entry) => entry.inner);
        const target = {
            addEventListener: (
                type: string,
                listener: any,
                options?: boolean | AddEventListenerOptions,
            ) => {
                const list = this.forwardedInnerListeners.get(innerName) ?? [];
                list.push({ type, listener, options });
                this.forwardedInnerListeners.set(innerName, list);
                currentInnerRefs().forEach(({ inner }) =>
                    inner.addEventListener(type, listener, options),
                );
            },
            removeEventListener: (
                type: string,
                listener: any,
                options?: boolean | AddEventListenerOptions,
            ) => {
                const list = (this.forwardedInnerListeners.get(innerName) ?? []).filter(
                    (item) => !(item.type === type && item.listener === listener),
                );
                this.forwardedInnerListeners.set(innerName, list);
                currentInnerRefs().forEach(({ inner }) =>
                    inner.removeEventListener(type, listener, options),
                );
            },
            find: (predicate: (viewState: ViewState, c: Coordinate) => boolean) => {
                for (const { inner, viewState, coordinate } of currentInnerRefs())
                    if (predicate(viewState, coordinate)) return inner;
            },
            map: (handler: (inner: any, viewState: ViewState, coordinate: Coordinate) => any) =>
                currentInnerRefs().map(({ inner, viewState, coordinate }) =>
                    handler(inner, viewState, coordinate),
                ),
        };
        return new Proxy(target, GetTrapProxy([EVENT_TRAP]));
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
    return target.getFromComponent(prop);
};

const DELEGATE_REFS_TO_COMP_TRAP = (target: ComponentRefsImpl<any, any>, prop) => {
    const instance = target.getInstance();
    return instance ? instance[prop] : undefined;
};

// DL#194 Fork C: delegate a slot name (e.g. `body`) on a Tier 3 instance's refs to the parent-owned
// slot ref manager, so `refs.<instance>.<slot>.<ref>` resolves. Runs before the comp delegation so a
// slot name is served from the parent-owned fragment; real impl members and the child component's own
// refs fall through. `onXxx` is handled by EVENT_TRAP first, so it never reaches here.
const DELEGATE_SLOT_REF_TRAP = (target: ComponentRefsImpl<any, any>, prop) => {
    if (typeof prop !== 'string') return false;
    if (prop in target) return false;
    return target.getSlotRef(prop);
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

const ComponentRefProxy = GetTrapProxy([
    EVENT_TRAP,
    DELEGATE_SLOT_REF_TRAP,
    DELEGATE_REFS_TO_COMP_TRAP,
]);

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

// DL#193 Phase 3: delegate a forwarded inner ref name (e.g. `cta`) on a component collection to an
// aggregate over each instance's inner ref. Runs after EVENT_TRAP so collection-level `onXxx` and
// the collection's own methods (`find`/`map`/`addEventListener`) fall through to the impl.
const DELEGATE_COLLECTION_INNER_REF_TRAP = (target: ComponentCollectionRefImpl<any, any>, prop) => {
    if (typeof prop !== 'string') return false;
    // Any real member of the collection impl (listeners, elements, map, find,
    // add/removeEventListener, getPublicAPI, …) must fall through to the target — including when an
    // unbound method re-enters the proxy via `this.<member>`. Only genuine forwarded inner-ref names
    // (e.g. `cta`), which are not members of the impl, reach the aggregate. `onXxx` is handled by
    // EVENT_TRAP first, so it never gets here.
    if (prop in target) return false;
    if (!target.hasForwardedInnerRef(prop)) return false;
    return target.getForwardedInnerRef(prop);
};

// DL#194 Fork C, under repetition: delegate a slot name (e.g. `body`) on a Tier 3 instance's
// component collection to the parent-owned slot ref manager, so `refs.<collection>.<slot>.<ref>`
// resolves. Mirrors DELEGATE_SLOT_REF_TRAP for the non-repeated (ComponentRefsImpl) case. Runs
// before the forwarded-inner-ref trap; real impl members and `onXxx` (EVENT_TRAP) fall through.
const DELEGATE_COLLECTION_SLOT_REF_TRAP = (target: ComponentCollectionRefImpl<any, any>, prop) => {
    if (typeof prop !== 'string') return false;
    if (prop in target) return false;
    return target.getSlotRef(prop);
};

const ComponentCollectionRefProxy = GetTrapProxy([
    EVENT_TRAP,
    DELEGATE_COLLECTION_SLOT_REF_TRAP,
    DELEGATE_COLLECTION_INNER_REF_TRAP,
]);

export function newComponentCollectionPublicApiProxy<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
>(
    ref: ComponentCollectionRefImpl<ViewState, ComponentType>,
): ComponentCollectionProxy<ViewState, ComponentType> {
    return new Proxy(ref, ComponentCollectionRefProxy);
}
