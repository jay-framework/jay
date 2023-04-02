import {
    createJayContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy, HTMLNativeExec,
    JayEventHandler,
    JayNativeFunction, MountFunc, noopMount, normalizeUpdates, provideContext, updateFunc, useContext
} from "jay-runtime";
import {checkModified, getRevision} from "jay-reactive";
import {
    addEventListenerMessage,
    JayEndpoint,
    JayPortMessageType,
    JPMMessage,
    removeEventListenerMessage
} from "../comm-channel";

interface SandboxCreationContext<ViewState> {
    viewState: ViewState,
    endpoint: JayEndpoint
}

const SANDBOX_CREATION_CONTEXT = createJayContext<SandboxCreationContext<any>>()

interface SandboxElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
    refs: Refs
}

export function sandboxElement<ViewState>(refName: string): SandboxElement<ViewState> {
    const {viewState, endpoint} = useContext(SANDBOX_CREATION_CONTEXT)
    let refImpl = new StaticRefImplementation(refName, endpoint, viewState);
    let ref = proxyRef(refImpl)
    return {
        update: refImpl.update,
        mount: noopMount,
        unmount: noopMount,
        refs: {[refName]: ref}
    }
}

function itemsToItemsMap<ParentViewState, ItemViewState>(
    viewState: ParentViewState,
    getItems: (viewState: ParentViewState) => ItemViewState[],
    matchBy: string,
): Map<string, ItemViewState> {
    return new Map(this.getItems(viewState)
        .map(item => [item[this.matchBy], item]));
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
    const {viewState, endpoint} = useContext(SANDBOX_CREATION_CONTEXT)
    let lastItems = getRevision<ItemViewState[]>([]);
    let childElementsMap: Map<string, SandboxElement<ItemViewState>[]> = new Map();

    let update = (viewState: ParentViewState) => {
        let newItems = getItems(viewState);
        let isModified;
        [lastItems, isModified] = checkModified(newItems, lastItems);
        if (isModified) {
            let {removedItems, addedItems} = compareLists(lastItems.value, newItems, matchBy)
            addedItems.forEach(item => {
                let childElements = provideContext(SANDBOX_CREATION_CONTEXT, {endpoint, viewState: item}, children)
                childElementsMap.set(item[matchBy], childElements);
            })
            removedItems.forEach(item => {
                let childElements = childElementsMap.get(item[matchBy])
                childElements.forEach(childElement => childElement.unmount)
                childElementsMap.delete(item[matchBy])
            })
        }
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
        unmount: unmount,
        refs: {}
    }
}

// export enum SandboxRefType {
//     condition = 0,
//     forEach = 1,
//     comp = 2
// }
//
// export interface SandboxCondition<ViewState> {
//     readonly type: SandboxRefType.condition
//     condition: (viewState: ViewState) => boolean
//     children: SandboxRefs<ViewState>
// }
//
// export interface SandboxComp<ViewState, Props> {
//     readonly type: SandboxRefType.comp
//     compCreator: JayComponentConstructor<Props>,
//     getProps: (viewState: ViewState) => Props,
//     refName: string
// }
//
// export interface SandboxForEach<ParentViewState, ItemViewState> {
//     readonly type: SandboxRefType.forEach
//     getItems: (viewState: ParentViewState) => ItemViewState[]
//     matchBy: string
//     children: SandboxRefs<ItemViewState>
// }
// export function sandboxForEach<ParentViewState, ItemViewState>(getItems: (viewState: ParentViewState) => ItemViewState[],
//                                                                matchBy: string,
//                                                                children: SandboxRefs<ItemViewState>): SandboxForEach<ParentViewState, ItemViewState> {
//     return {getItems, matchBy, children, type: SandboxRefType.forEach}
// }

// export type SandboxRef<ViewState> = string |
//     SandboxForEach<ViewState, any> |
//     SandboxCondition<ViewState> |
//     SandboxComp<ViewState, any>
// export type SandboxRefs<ViewState> = SandboxRef<ViewState>[];

type Refs = Record<string, HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>>

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
    invoke: (type: string) => void
    update(newViewState: ViewState)
}

export class StaticRefImplementation<ViewState> {
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

    invoke = (type: string) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: this.viewState,
                coordinate: this.ref
            })
    }
    $exec<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
        return null;
    }
    update = (newViewState: ViewState) => {
        this.viewState = newViewState
    }
}

export class DynamicRefImplementation<ViewState> {
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

    invoke = (type: string) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: type,
                viewState: this.viewState,
                coordinate: this.ref
            })
    }
    find(predicate: (t: ViewState) => boolean): HTMLNativeExec<ViewState, any> {

    }
    map<ResultType>(handler: (element: HTMLNativeExec<ViewState, any>, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType> {

    }
    update(newViewState: ViewState) {
        this.viewState = newViewState
    }
}

class DataCollectionRef<ParentViewState, ItemViewState> {
    private items: Map<string, ItemViewState> = new Map();
    constructor(viewState: ParentViewState, private getItems: (viewState: ParentViewState) => ItemViewState[], private matchBy: string) {

    }

    update(viewState: ParentViewState) {
        let newItems: Map<string, ItemViewState> = new Map(this.getItems(viewState)
            .map(item => [item[this.matchBy], item]));

        this.items = newItems
    }
}

export function mkBridgeElement<ViewState>(viewState: ViewState, endpoint: JayEndpoint, sandboxElements: () => SandboxElement<ViewState>[]): SandboxBridgeElement<ViewState> {
    return provideContext(SANDBOX_CREATION_CONTEXT, {endpoint, viewState}, () => {
        let elements = sandboxElements();
        let update = normalizeUpdates(elements.map(el => el.update));
        let refs = elements.reduce((acc, obj) => {
            return {...acc, ...obj.refs}
        }, {}) as Refs;

        endpoint.onUpdate((inMessage: JPMMessage) => {
            switch (inMessage.type) {
                case JayPortMessageType.DOMEvent: {
                    refs[inMessage.coordinate.split('/').slice(-1)[0]].invoke(inMessage.eventType)
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