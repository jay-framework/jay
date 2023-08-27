import {
    BaseJayElement,
    JayComponent,
    JayComponentConstructor, JayEventHandlerWrapper,
    MountFunc,
    noopMount,
    provideContext,
    updateFunc,
    useContext
} from "jay-runtime";
import {SANDBOX_CREATION_CONTEXT, SANDBOX_BRIDGE_CONTEXT} from "./sandbox-context";
import {
    componentWrapper,
    DynamicCompRefImplementation,
    DynamicNativeExec,
    DynamicRefImplementation,
    SecureElementRef,
    StaticRefImplementation
} from "./sandbox-refs";
import {PrivateRef} from "jay-runtime/dist/node-reference";

export interface SandboxElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
}

export function sandboxElement<ViewState>(ref: SecureElementRef<any, any>): SandboxElement<ViewState> {
    return ref;
}

export function sandboxChildComp<ParentVS, Props, ChildT,
    ChildElement extends BaseJayElement<ChildT>, ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentVS) => Props,
    ref: PrivateRef<ParentVS, ChildComp>): SandboxElement<ParentVS> {
    let {viewState, refs, dataIds, isDynamic, endpoint, parentComponentReactive} = useContext(SANDBOX_CREATION_CONTEXT)
    let coordinate = [...dataIds, ref.coordinate];
    let context = {compId: endpoint.compId, coordinate, port: endpoint.port}
    let childComp = provideContext(SANDBOX_BRIDGE_CONTEXT, context, () => {
        return compCreator(getProps(viewState))
    })
    ref.set(childComp);
    // TODO component wrapper
    let eventWrapper: JayEventHandlerWrapper<any, any, any> = parentComponentReactive?
        (orig, event) => {
            return parentComponentReactive.batchReactions(() => orig(event))
        }:
        (orig, event) => orig(event);
    // let [compWrapper, updateRef] = componentWrapper(childComp, viewState, coordinate, eventWrapper);

    return {
      update: (newViewState) => {
          ref.update(newViewState);
          childComp.update(getProps(newViewState));
      },
      mount: () => {
          ref.mount();
          childComp.mount()
      },
      unmount: () => {
          ref.unmount();
          childComp.unmount()
      }
    }


    // if (isDynamic && refs) {
    //     let ref = (refs[refName] as any as DynamicCompRefImplementation<ParentVS, ReturnType<typeof compCreator>>);
    //     ref.setItem(coordinate, viewState, compWrapper);
    //     let mounted = true;
    //     return {
    //         update: (newViewState) => {
    //             viewState = newViewState;
    //             if (mounted) {
    //                 ref.update(coordinate, newViewState)
    //                 updateRef(newViewState);
    //                 childComp.update(getProps(newViewState))
    //             }
    //         },
    //         mount: () => {
    //             mounted = true;
    //             ref.setItem(coordinate, viewState, compWrapper)
    //             childComp.mount();
    //         },
    //         unmount: () => {
    //             mounted = false;
    //             ref.removeItem(coordinate, compWrapper)
    //             childComp.unmount();
    //         }
    //     }
    // }
    // else {
    //     if (refs)
    //         refs[refName] = proxyCompRef(compWrapper);
    //     let update = (t: ParentVS) => {
    //         updateRef(t);
    //         childComp.update(getProps(t));
    //     }
    //     let mount = childComp.mount
    //     let unmount = childComp.unmount
    //     return {
    //         update, mount, unmount
    //     }
    // }
}

function compareLists<ItemViewState extends object>(oldList: ItemViewState[], newList: ItemViewState[], matchBy: string):
    { removedItems: ItemViewState[], addedItems: ItemViewState[], itemsToUpdate: ItemViewState[]} {
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
            let isModified = newItem !== oldItem;
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
    const {viewState, endpoint, refs, dataIds, parentComponentReactive} = useContext(SANDBOX_CREATION_CONTEXT)
    let lastItems: ItemViewState[] = [];
    let childElementsMap: Map<string, SandboxElement<ItemViewState>[]> = new Map();
    let update = (viewState: ParentViewState) => {
        let newItems = getItems(viewState) || [];
        let isModified = newItems !== lastItems;
        if (isModified) {
            let {removedItems, addedItems, itemsToUpdate} = compareLists(lastItems, newItems, matchBy)
            addedItems.forEach(item => {
                let childElements = provideContext(SANDBOX_CREATION_CONTEXT,
                    {endpoint, viewState: item, refs, dataIds: [...dataIds, item[matchBy]], isDynamic: true, parentComponentReactive}, children)
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

            lastItems = newItems;
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
        unmount: unmount
    }
}

export function sandboxCondition<ViewState>(condition: (newData: ViewState) => boolean, children: SandboxElement<ViewState>[]): SandboxElement<ViewState> {
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