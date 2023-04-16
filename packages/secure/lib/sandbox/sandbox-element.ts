import {checkModified, getRevision} from "jay-reactive";
import {
    JayComponentConstructor,
    MountFunc,
    noopMount,
    provideContext,
    updateFunc,
    useContext
} from "jay-runtime";
import {SANDBOX_CREATION_CONTEXT} from "./sandbox-context";
import {
    DynamicCompRefImplementation,
    DynamicNativeExec,
    DynamicRefImplementation,
    proxyRef,
    StaticRefImplementation
} from "./sandbox-refs";

export interface SandboxElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
}

export function sandboxElement<ViewState>(refName: string): SandboxElement<ViewState> {
    let {viewState, endpoint, refs, isDynamic, dataIds} = useContext(SANDBOX_CREATION_CONTEXT)
    if (isDynamic) {
        if (!refs[refName]) {
            refs[refName] = proxyRef(new DynamicRefImplementation(refName, endpoint))
        }
        let ref = (refs[refName] as any as DynamicRefImplementation<ViewState>);
        let coordinate = [...dataIds, refName];
        let refItem = new DynamicNativeExec<ViewState>(refName, coordinate, endpoint);
        ref.setItem(coordinate, viewState, refItem)
        let mounted = true;
        return {
            update: (newViewState) => {
                viewState = newViewState;
                if (mounted)
                    ref.setItem(coordinate, newViewState, refItem)
            },
            mount: () => {
                mounted = true;
                ref.setItem(coordinate, viewState, refItem)
            },
            unmount: () => {
                mounted = false;
                ref.removeItem(coordinate)
            }
        }
    }
    else {
        let refImpl = new StaticRefImplementation(refName, endpoint, viewState);
        refs[refName] = proxyRef(refImpl)
        return {
            update: refImpl.update,
            mount: noopMount,
            unmount: noopMount
        }
    }
}

export function sandboxChildComp<ParentVS, Props>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentVS) => Props,
    refName: string): SandboxElement<ParentVS> {
    let {viewState, refs, dataIds, isDynamic} = useContext(SANDBOX_CREATION_CONTEXT)
    let childComp = compCreator(getProps(viewState))
    if (isDynamic) {
        if (!refs[refName]) {
            refs[refName] = proxyRef(new DynamicCompRefImplementation())
        }
        let ref = (refs[refName] as any as DynamicCompRefImplementation<ParentVS, ReturnType<typeof compCreator>>);
        let coordinate = [...dataIds, refName];
        ref.setItem(coordinate, viewState, childComp);
        let mounted = true;
        return {
            update: (newViewState) => {
                viewState = newViewState;
                if (mounted) {
                    ref.setItem(coordinate, newViewState, childComp)
                    childComp.update(getProps(newViewState))
                }
            },
            mount: () => {
                mounted = true;
                ref.setItem(coordinate, viewState, childComp)
                childComp.mount();
            },
            unmount: () => {
                mounted = false;
                ref.removeItem(coordinate)
                childComp.unmount();
            }
        }
    }
    else {
        refs[refName] = childComp;
        let update = (t: ParentVS) => childComp.update(getProps(t));
        let mount = childComp.mount
        let unmount = childComp.unmount
        return {
            update, mount, unmount
        }
    }
}

function compareLists<ItemViewState extends object>(oldList: ItemViewState[], newList: ItemViewState[], matchBy: string):
    { removedItems: ItemViewState[], addedItems: ItemViewState[], itemsToUpdate: ItemViewState[] } {
    let removedItems = [];
    let addedItems = [];
    let itemsToUpdate = [];
    let newListIds = new Set(newList.map(item => item[matchBy]));
    let oldListIdsMap = new Map(oldList.map(item => [item[matchBy], item]));
    oldList.forEach(oldItem => {
        if (!newListIds.has(oldItem[matchBy]))
            removedItems.push(oldItem)
    })
    newList.forEach(newItem => {
        if (!oldListIdsMap.has(newItem[matchBy]))
            addedItems.push(newItem)
        else {
            let oldItem = oldListIdsMap.get(newItem[matchBy]);
            let oldItemRevisioned = getRevision(oldItem);
            let [, isModified] = checkModified(newItem, oldItemRevisioned)
            if (isModified)
                itemsToUpdate.push(newItem);
        }

    })
    return {removedItems, addedItems, itemsToUpdate}
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
        let newItems = getItems(viewState) || [];
        let isModified, newItemsRevisioned;
        [newItemsRevisioned, isModified] = checkModified(newItems, lastItems);
        if (isModified) {
            let {removedItems, addedItems, itemsToUpdate} = compareLists(lastItems.value, newItems, matchBy)
            addedItems.forEach(item => {
                let childElements = provideContext(SANDBOX_CREATION_CONTEXT,
                    {endpoint, viewState: item, refs, dataIds: [...dataIds, item[matchBy]], isDynamic: true}, children)
                childElementsMap.set(item[matchBy], childElements);
            })
            removedItems.forEach(item => {
                let childElements = childElementsMap.get(item[matchBy])
                childElements.forEach(childElement => childElement.unmount())
                childElementsMap.delete(item[matchBy])
            })
            itemsToUpdate.forEach(item => {
                childElementsMap.get(item[matchBy]).forEach(childElement => {
                    childElement.update(item);
                })
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

export function SandboxCondition<ViewState>(condition: (newData: ViewState) => boolean, children: SandboxElement<ViewState>[]): SandboxElement<ViewState> {
    let {viewState} = useContext(SANDBOX_CREATION_CONTEXT)
    let state = condition(viewState);
    let mounted = true;
    let childMounted = true;
    const updateChild = () => {
        let newState = condition(viewState);
        if (mounted) {
            if (newState !== state || childMounted !== newState) {
                newState ? children.forEach(_ => _.mount()) :
                    children.forEach(_ => _.unmount());
                childMounted = newState;
            }
        } else {
            if (childMounted)
                children.forEach(_ => _.unmount());
            childMounted = false;
        }
    };
    updateChild();

    const update = (newViewState) => {
        viewState = newViewState;
        children.forEach(_ => _.update(newViewState))
        updateChild();
    }
    const mount = () => {
        mounted = true;
        updateChild();
    }
    const unmount = () => {
        mounted = false;
        updateChild();
    }
    return {update, mount, unmount}
}