import {
    ComponentCollectionRefImpl,
    Coordinate,
    GlobalJayEvents,
    HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget,
    HTMLElementProxy,
    HTMLElementProxyTarget,
    JayComponent,
    JayEvent,
    JayEventHandler,
    JayNativeFunction,
    MountFunc,
    normalizeUpdates,
    withContext,
    updateFunc,
    useContext,
    BaseReferencesManager,
    ComponentRefsImpl,
    ManagedRefs,
    JayEventHandlerWrapper,
    ManagedRefType,
    PrivateRefConstructor,
} from 'jay-runtime';
import { IJayEndpoint, JPMMessage } from '../comm-channel/comm-channel';
import { JayNativeFunction$ } from '../main/function-repository-types';
import { completeCorrelatedPromise, correlatedPromise, NativeIdMarker } from '../$func';
import { Refs, SANDBOX_BRIDGE_CONTEXT, SANDBOX_CREATION_CONTEXT } from './sandbox-context';
import { SandboxElement } from './sandbox-element';
import { Reactive } from 'jay-reactive';
import { serialize } from 'jay-serialization';
import {
    addEventListenerMessage,
    eventInvocationMessage,
    JayPortMessageType,
    JPMRootAPIInvoke,
    nativeExec,
    removeEventListenerMessage,
    renderMessage,
    rootApiReturns,
} from '../comm-channel/messages';
import { JSONPatch, ArrayContexts } from 'jay-json-patch';
import { EVENT_TRAP, GetTrapProxy } from 'jay-runtime';
import { COMPONENT_CONTEXT } from 'jay-component';

export interface SandboxBridgeElement<ViewState> {
    update: updateFunc<ViewState>;
    mount: MountFunc;
    unmount: MountFunc;
    refs: Refs;
}

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, any, any>,
        options?: boolean | AddEventListenerOptions,
        nativeId?: string,
    ): void;
    removeEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, any, any>,
        options?: EventListenerOptions | boolean,
    ): void;
    invoke: (type: string, coordinate: Coordinate, eventData?: any) => void;
}

export interface SecureElementRef<ViewState, PublicRefAPI> {
    update: updateFunc<ViewState>;
    mount: MountFunc;
    unmount: MountFunc;
}

export class SecureReferencesManager extends BaseReferencesManager {
    constructor(
        private ep: IJayEndpoint,
        public readonly eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ) {
        super(eventWrapper);
    }

    mkManagedRef(refType: ManagedRefType, refName: string): ManagedRefs {
        switch (refType) {
            case ManagedRefType.element:
                return new SecureHTMLElementRefsImpl(refName, this.ep);
            case ManagedRefType.elementCollection:
                return new SecureHTMLElementCollectionRefsImpl(refName, this.ep);
            case ManagedRefType.component:
                return new ComponentRefsImpl();
            case ManagedRefType.componentCollection:
                return new ComponentCollectionRefImpl();
        }
    }

    currentContext(): { currData: any; coordinate: (refName: string) => Coordinate } {
        let { viewState, dataIds } = useContext(SANDBOX_CREATION_CONTEXT);
        return { currData: viewState, coordinate: (refName: string) => [...dataIds, refName] };
    }

    static for(
        endpoint: IJayEndpoint,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
        elem: string[],
        elemCollection: string[],
        comp: string[],
        compCollection: string[],
    ): [SecureReferencesManager, PrivateRefConstructor<any>[]] {
        const refManager = new SecureReferencesManager(endpoint, eventWrapper);
        return [refManager, refManager.mkRefs(elem, elemCollection, comp, compCollection)];
    }

    static forElement(
        elem: string[],
        elemCollection: string[],
        comp: string[],
        compCollection: string[],
    ) {
        const parentComponentContext = useContext(SANDBOX_BRIDGE_CONTEXT);
        const { reactive, getComponentInstance } = useContext(COMPONENT_CONTEXT);
        const thisComponentEndpoint = parentComponentContext.port.getEndpoint(
            parentComponentContext.compId,
            parentComponentContext.coordinate,
        );
        return SecureReferencesManager.for(
            thisComponentEndpoint,
            (orig, event) => {
                return reactive.batchReactions(() => orig(event));
            },
            elem,
            elemCollection,
            comp,
            compCollection,
        );
    }

    static forSandboxRoot(
        elem: string[],
        elemCollection: string[],
        comp: string[],
        compCollection: string[],
    ) {
        const { endpoint } = useContext(SANDBOX_CREATION_CONTEXT);
        return SecureReferencesManager.for(
            endpoint,
            undefined,
            elem,
            elemCollection,
            comp,
            compCollection,
        );
    }
}

export abstract class SecurePrivateRefs<ViewState, ElementType extends HTMLElement>
    implements RefImplementation<ViewState>
{
    listeners = new Map<string, JayEventHandler<any, any, any>>();
    items = new Map<string, SecureHTMLElementRefImpl<ViewState, ElementType>>();

    constructor(
        protected ref: string,
        protected ep: IJayEndpoint,
    ) {}

    addEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, ViewState, any> | null,
        options?: boolean | AddEventListenerOptions,
        nativeId?: string,
    ): void {
        this.ep.post(addEventListenerMessage(this.ref, type, nativeId));
        this.listeners.set(type, listener);
    }
    removeEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, ViewState, any> | null,
        options?: EventListenerOptions | boolean,
    ): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type);
    }

    invoke = (type: string, coordinate: Coordinate, eventData?: any) => {
        let listener = this.listeners.get(type);
        if (listener) {
            let item = this.items.get(coordinate.toString());
            if (item)
                listener({
                    event: eventData,
                    viewState: item.viewState,
                    coordinate: item.coordinate,
                });
        }
    };

    addRef(ref: SecureHTMLElementRefImpl<ViewState, ElementType>) {
        let key = ref.coordinate.toString();
        if (!this.items.has(key)) {
            this.items.set(key, ref);
        }
    }

    removeRef(ref: SecureHTMLElementRefImpl<ViewState, ElementType>) {
        this.items.delete(ref.coordinate.toString());
    }
}

export class SecureHTMLElementRefImpl<ViewState, ElementType extends HTMLElement>
    implements
        SecureElementRef<ViewState, HTMLElementProxy<ViewState, ElementType>>,
        HTMLElementProxyTarget<ViewState, ElementType>,
        RefImplementation<ViewState>
{
    listeners = new Map<string, JayEventHandler<any, any, any>>();

    constructor(
        private ref: string,
        private ep: IJayEndpoint,
        public viewState: ViewState,
        public readonly coordinate: Coordinate,
        private parentCollection?: SecurePrivateRefs<ViewState, ElementType>,
    ) {
        this.parentCollection?.addRef(this);
    }

    addEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, any, any>,
        options?: boolean | AddEventListenerOptions,
        nativeId?: string,
    ): void {
        this.ep.post(addEventListenerMessage(this.ref, type, nativeId));
        this.listeners.set(type, listener);
    }
    removeEventListener<E extends Event>(
        type: string,
        listener: JayEventHandler<E, any, any>,
        options?: EventListenerOptions | boolean,
    ): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type);
    }

    invoke = (type: string, coordinate: Coordinate, eventData?: any) => {
        let listener = this.listeners.get(type);
        if (listener)
            listener({
                event: eventData,
                viewState: this.viewState,
                coordinate: coordinate,
            });
    };
    exec$<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
        let { execPromise$, correlationId } = correlatedPromise<ResultType>();
        this.ep.post(
            nativeExec(
                (handler as JayNativeFunction$<any, any, ResultType>).id,
                correlationId,
                this.ref,
                this.coordinate,
            ),
        );
        return execPromise$;
    }
    update = (newViewState: ViewState) => {
        this.viewState = newViewState;
    };

    mount(): void {
        this.parentCollection?.addRef(this);
    }

    unmount(): void {
        this.parentCollection?.removeRef(this);
    }

    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return newSecureHTMLElementPublicApiProxy(this);
    }
}

class SecureHTMLElementRefsImpl<ViewState, ElementType extends HTMLElement>
    extends SecurePrivateRefs<ViewState, ElementType>
    implements
        HTMLElementProxyTarget<ViewState, ElementType>,
        RefImplementation<ViewState>,
        ManagedRefs
{
    mkManagedRef(
        currData: any,
        coordinate: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ): SecureHTMLElementRefImpl<ViewState, ElementType> {
        return new SecureHTMLElementRefImpl(this.ref, this.ep, currData, coordinate, this);
    }

    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return newSecureHTMLElementPublicApiProxy(this);
    }

    exec$<T>(handler: (elem: ElementType, viewState: ViewState) => T): Promise<T> {
        return [...this.items][0][1].exec$(handler);
    }
}

export class SecureHTMLElementCollectionRefsImpl<ViewState, ElementType extends HTMLElement>
    extends SecurePrivateRefs<ViewState, ElementType>
    implements
        HTMLElementCollectionProxyTarget<ViewState, ElementType>,
        RefImplementation<ViewState>,
        ManagedRefs
{
    mkManagedRef(
        currData: any,
        coordinate: Coordinate,
        eventWrapper: JayEventHandlerWrapper<any, any, any>,
    ): SecureHTMLElementRefImpl<ViewState, ElementType> {
        return new SecureHTMLElementRefImpl(this.ref, this.ep, currData, coordinate, this);
    }

    getPublicAPI(): HTMLElementCollectionProxy<ViewState, ElementType> {
        return newSecureHTMLElementPublicApiProxy(this);
    }

    find(
        predicate: (t: ViewState, c: Coordinate) => boolean,
    ): HTMLElementProxy<ViewState, ElementType> | undefined {
        for (const [, item] of this.items)
            if (predicate(item.viewState, item.coordinate)) {
                return item.getPublicAPI();
            }
    }
    map<ResultType>(
        handler: (
            element: HTMLElementProxy<ViewState, ElementType>,
            viewState: ViewState,
            coordinate: Coordinate,
        ) => ResultType,
    ): Array<ResultType> {
        let promises: Array<ResultType> = [];
        for (const [, item] of this.items) {
            const handlerResponse = handler(item.getPublicAPI(), item.viewState, item.coordinate);
            if (handlerResponse) promises.push(handlerResponse);
        }
        return promises;
    }
}

const SECURE_EVENT$_TRAP = (target, prop) => {
    if (typeof prop === 'string') {
        if (prop.indexOf('on') === 0 && prop.at(-1) === '$') {
            let eventName = prop.slice(2, -1);
            return (func$: NativeIdMarker) => {
                let regularHandler;
                const handler = ({ event, viewState, coordinate }) => {
                    if (regularHandler) regularHandler({ event, viewState, coordinate });
                };
                target.addEventListener(eventName, handler, undefined, func$.id);
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

const SecureHTMLElementRefProxy = GetTrapProxy([SECURE_EVENT$_TRAP, EVENT_TRAP]);

export function newSecureHTMLElementPublicApiProxy<
    ViewState,
    ElementType extends HTMLElement,
    Target extends
        | SecureHTMLElementRefImpl<ViewState, ElementType>
        | SecureHTMLElementRefsImpl<ViewState, ElementType>
        | SecureHTMLElementCollectionRefsImpl<ViewState, ElementType>,
>(ref: Target): Target & GlobalJayEvents<ViewState> {
    return new Proxy(ref, SecureHTMLElementRefProxy) as Target & GlobalJayEvents<ViewState>;
}

export function mkBridgeElement<ViewState>(
    viewState: ViewState,
    sandboxElements: () => SandboxElement<ViewState>[],
    endpoint: IJayEndpoint,
    reactive: Reactive,
    refManager: SecureReferencesManager,
    getComponentInstance: () => JayComponent<any, any, any>,
    arraySerializationContext: ArrayContexts,
): SandboxBridgeElement<ViewState> {
    let events = {};
    let port = endpoint.port;
    return withContext(
        SANDBOX_CREATION_CONTEXT,
        {
            endpoint,
            viewState,
            dataIds: [],
            isDynamic: false,
            parentComponentReactive: reactive,
        },
        () => {
            let elements = sandboxElements();
            let patch: JSONPatch,
                nextSerialize = serialize; // TODO add diff context
            let postUpdateMessage = (newViewState) => {
                [patch, nextSerialize] = nextSerialize(newViewState, arraySerializationContext);
                if (patch.length) endpoint.post(renderMessage(patch));
            };
            let update = normalizeUpdates([postUpdateMessage, ...elements.map((el) => el.update)]);

            endpoint.onUpdate(async (inMessage: JPMMessage) => {
                switch (inMessage.type) {
                    case JayPortMessageType.eventInvocation: {
                        reactive.batchReactions(() => {
                            (
                                refManager.get(
                                    inMessage.coordinate.slice(-1)[0],
                                ) as any as RefImplementation<ViewState>
                            ).invoke(
                                inMessage.eventType,
                                inMessage.coordinate,
                                inMessage.eventData,
                            );
                        });
                        break;
                    }
                    case JayPortMessageType.nativeExecResult: {
                        reactive.batchReactions(() => {
                            completeCorrelatedPromise(inMessage);
                        });
                        break;
                    }
                    case JayPortMessageType.rootApiInvoke: {
                        let message = inMessage as JPMRootAPIInvoke;
                        let returns, error;
                        try {
                            returns = await getComponentInstance()[message.apiName](message.params);
                        } catch (err) {
                            error = err;
                        }
                        port.batch(() => {
                            endpoint.post(rootApiReturns(message.callId, returns, error));
                        });
                        break;
                    }
                    case JayPortMessageType.addEventListener: {
                        let handler = ({ event, coordinate }: JayEvent<any, any>) => {
                            port.batch(() => {
                                endpoint.post(
                                    eventInvocationMessage(inMessage.eventType, coordinate, event),
                                );
                            });
                        };
                        events[inMessage.eventType] = handler;
                        getComponentInstance().addEventListener(inMessage.eventType, handler);
                        break;
                    }
                    case JayPortMessageType.removeEventListener: {
                        getComponentInstance().removeEventListener(
                            inMessage.eventType,
                            events[inMessage.eventType],
                        );
                        delete events[inMessage.eventType];
                    }
                }
            });

            const mount = () => elements.forEach((_) => _.mount());
            const unmount = () => elements.forEach((_) => _.unmount());

            mount();
            return refManager.applyToElement({
                dom: undefined,
                update,
                mount,
                unmount,
            });
        },
    );
}
