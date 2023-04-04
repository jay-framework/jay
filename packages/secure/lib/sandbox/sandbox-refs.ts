import {
    Coordinate,
    createJayContext,
    HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget,
    HTMLElementProxy,
    HTMLElementProxyTarget,
    HTMLNativeExec,
    JayEventHandler,
    JayNativeFunction,
    MountFunc,
    noopMount,
    normalizeUpdates,
    provideContext,
    updateFunc,
    useContext
} from "jay-runtime";
import {checkModified, getRevision} from "jay-reactive";
import {
    addEventListenerMessage,
    JayEndpoint,
    JayPortMessageType,
    JPMMessage,
    removeEventListenerMessage
} from "../comm-channel";

type Refs = Record<string, HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>>

interface SandboxCreationContext<ViewState> {
    viewState: ViewState,
    endpoint: JayEndpoint,
    refs: Refs,
    dataIds: string[]
}

const SANDBOX_CREATION_CONTEXT = createJayContext<SandboxCreationContext<any>>()

interface SandboxElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
}

export function sandboxElement<ViewState>(refName: string): SandboxElement<ViewState> {
    const {viewState, endpoint, refs} = useContext(SANDBOX_CREATION_CONTEXT)
    let refImpl = new StaticRefImplementation(refName, endpoint, viewState);
    refs[refName] = proxyRef(refImpl)
    return {
        update: refImpl.update,
        mount: noopMount,
        unmount: noopMount
    }
}

export function sandboxDynamicElement<ViewState>(refName: string): SandboxElement<ViewState> {
    const {viewState, refs, dataIds} = useContext(SANDBOX_CREATION_CONTEXT);
    (refs[refName] as any as DynamicRefImplementation<ViewState>).addItem(dataIds, viewState)
    return {
        update: () => {},
        mount: noopMount,
        unmount: noopMount
    }
}

function compareLists<ItemViewState extends object>(oldList: ItemViewState[], newList: ItemViewState[], matchBy: string):
    {removedItems: ItemViewState[], addedItems: ItemViewState[]} {
    let removedItems = [];
    let addedItems = [];
    let newListIds = new Set(newList.map(item => item[matchBy]));
    let oldListIds = new Set(oldList.map(item => item[matchBy]));
    oldList.forEach(oldItem => {
        if (!newListIds.has(oldItem[matchBy]))
            removedItems.push(oldItem)
    })
    newList.forEach(newItem => {
        if (!oldListIds.has(newItem[matchBy]))
            addedItems.push(newItem)
    })
    return {removedItems, addedItems}
}

export function sandboxForEach<ParentViewState, ItemViewState extends object>(
    getItems: (viewState: ParentViewState) => ItemViewState[],
    matchBy: string,
    children: () => SandboxElement<ItemViewState>[]
): SandboxElement<ParentViewState> {
    const {viewState, endpoint, refs, dataIds} = useContext(SANDBOX_CREATION_CONTEXT)
    let lastItems = getRevision<ItemViewState[]>([]);
    let childElementsMap: Map<string, SandboxElement<ItemViewState>[]> = new Map();

    let update = (viewState: ParentViewState) => {
        let newItems = getItems(viewState);
        let isModified, newItemsRevisioned;
        [newItemsRevisioned, isModified] = checkModified(newItems, lastItems);
        if (isModified) {
            let {removedItems, addedItems} = compareLists(lastItems.value, newItems, matchBy)
            addedItems.forEach(item => {
                let childElements = provideContext(SANDBOX_CREATION_CONTEXT,
                    {endpoint, viewState: item, refs, dataIds: [...dataIds, item[matchBy]]}, children)
                childElementsMap.set(item[matchBy], childElements);
            })
            removedItems.forEach(item => {
                let childElements = childElementsMap.get(item[matchBy])
                childElements.forEach(childElement => childElement.unmount)
                childElementsMap.delete(item[matchBy])
            })
        }
        lastItems = newItemsRevisioned;
    }

    let mountUnmount = (op) => () => {
        childElementsMap.forEach((childElements) =>
            childElements.forEach(childElement => childElement[op]())
        )
    }
    let mount = mountUnmount('mount')
    let unmount = mountUnmount('unmount')

    update(viewState)

    return {
        update,
        mount: mount,
        unmount: unmount
    }
}

interface SandboxBridgeElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
    refs: Refs
}

const proxyHandler = {
    get: function(target: RefImplementation<any>, prop, receiver) {
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

function proxyRef<ViewState>(refDef: StaticRefImplementation<ViewState> | DynamicRefImplementation<ViewState>): HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> {
    return new Proxy(refDef, proxyHandler) as any as HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>;
}

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void
    invoke: (type: string, coordinate: Coordinate) => void
    update(newViewState: ViewState)
}

export class StaticRefImplementation<ViewState> implements HTMLElementProxyTarget<ViewState, any>{
    listeners = new Map<string, JayEventHandler<any, any, any>>()

    constructor(
        private ref: string, private ep: JayEndpoint, private viewState: ViewState) {
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.ep.post(addEventListenerMessage(this.ref, type));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    invoke = (type: string, coordinate: Coordinate) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: this.viewState,
                coordinate: coordinate
            })
    }
    $exec<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
        return null;
    }
    update = (newViewState: ViewState) => {
        this.viewState = newViewState
    }
}

export class DynamicRefImplementation<ViewState> implements HTMLElementCollectionProxyTarget<ViewState, any> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()
    items = new Map<string, ViewState>();

    constructor(
        private ref: string, private ep: JayEndpoint) {
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
        this.ep.post(addEventListenerMessage(this.ref, type));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    invoke = (type: string, coordinate: Coordinate) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: this.items.get(coordinate.slice(0, -1).toString()),
                coordinate: coordinate
            })
    }
    find(predicate: (t: ViewState) => boolean): HTMLNativeExec<ViewState, any> {

    }
    map<ResultType>(handler: (element: HTMLNativeExec<ViewState, any>, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> {

    }
    update(newViewState: ViewState) {
        console.log(newViewState);
    }

    addItem(dataIds: string[], viewState: ViewState) {
        this.items.set(dataIds.toString(), viewState)
    }

    removeItem(dataIds: string[]) {
        this.items.delete(dataIds.toString())
    }
}

export function mkBridgeElement<ViewState>(viewState: ViewState,
                                           endpoint: JayEndpoint,
                                           sandboxElements: () => SandboxElement<ViewState>[],
                                           dynamicRefs: string[] = []): SandboxBridgeElement<ViewState> {
    let refs = {};
    dynamicRefs.forEach(dynamicRef => {
        refs[dynamicRef] = proxyRef(new DynamicRefImplementation(dynamicRef, endpoint));
    })
    return provideContext(SANDBOX_CREATION_CONTEXT, {endpoint, viewState, refs, dataIds: []}, () => {
        let elements = sandboxElements();
        let update = normalizeUpdates(elements.map(el => el.update));

        endpoint.onUpdate((inMessage: JPMMessage) => {
            switch (inMessage.type) {
                case JayPortMessageType.DOMEvent: {
                    refs[inMessage.coordinate.slice(-1)[0]].invoke(inMessage.eventType, inMessage.coordinate)
                    break;
                }
            }
        })

        return {
            refs,
            update,
            mount: () => {},
            unmount: () => {}
        }
    })
}