import {BaseJayElement, ForEach, Conditional, forEach, JayComponent, childComp, isCondition, isForEach,
    noopUpdate, noopMount, normalizeUpdates, normalizeMount, MountFunc, updateFunc, currentConstructionContext,
    mkUpdateCollectionInternal,
    ContextStack} from 'jay-runtime'

// function mkUpdateCondition<ViewState>(child: ConditionalWorker<ViewState>): [updateFunc<ViewState>, MountFunc, MountFunc] {
//
// }

function mkUpdateCollection<ViewState, Item>(child: ForEachWorker<ViewState, Item>): [updateFunc<ViewState>, MountFunc, MountFunc] {
    return mkUpdateCollectionInternal(child, instructions => {});
}

interface WorkerConstructContext {
    [key: number | string]: WorkerConstructContext
}

function forEachWorkerContext<T, Item>(iid: number, forEach: () => ForEachWorker<T, Item>) {
    let newChildContext: WorkerConstructContext = {}
    workerConstructionContextStack.current()[iid] = newChildContext
    return workerConstructionContextStack.doWithContext(newChildContext, forEach)
}

function forEachElementCreatorWorkerContext<Item>(itemCreator: (Item, String) => BaseJayElement<Item>): (Item, String) => BaseJayElement<Item> {
    return (item, id) => {
        let newChildContext: WorkerConstructContext = {}
        workerConstructionContextStack.current()[id] = newChildContext
        return workerConstructionContextStack.doWithContext(newChildContext, () => itemCreator(item, id))
    }
}

function childCompWorkerContext<T>(iid: number, elementConstructor: () => BaseJayElement<T>): BaseJayElement<T> {
    let newChildContext: WorkerConstructContext = {}
    workerConstructionContextStack.current()[iid] = newChildContext
    // todo alocate tree id and pass it to the component
    return workerConstructionContextStack.doWithContext(newChildContext, elementConstructor)
}

export function withWorkerRootContext<T>(elementConstructor: () => BaseJayElement<T>): BaseJayElement<T> {
    return workerConstructionContextStack.doWithContext({}, elementConstructor)
}

const workerConstructionContextStack = new ContextStack<WorkerConstructContext>();

export function bridge<ViewState>(children: Array</*ConditionalWorker<ViewState> |*/ ForEachWorker<ViewState, any> | BaseJayElement<ViewState>> = []): BaseJayElement<ViewState> {
    let e = null, updates = [], mounts = [], unmounts = [];

    children.forEach(child => {
        let update = noopUpdate, mount = noopMount, unmount = noopMount;
        // if (isCondition(child)) {
        //     [update, mount, unmount] = mkUpdateCondition(child)
        // }
        // else
            if (isForEach(child)){
            [update, mount, unmount] = mkUpdateCollection(child)
        }
        else {
            if (child.update !== noopUpdate)
                updates.push(child.update);
            if (child.mount !== noopMount) {
                mounts.push(child.mount);
                unmounts.push(child.unmount);
            }
        }

        if (update !== noopUpdate) {
            let context = currentConstructionContext();
            update(context.currData)
            updates.push(update);
        }

        if (mount !== noopMount) {
            mounts.push(mount);
            unmounts.push(unmount);
        }
    });
    return {
        dom: e,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts)
    };

}

export interface ForEachWorker<ViewState, Item> extends ForEach<ViewState, Item> {
    iid: number
}

export function forEachWorker<T, Item>(iid: number, getItems: (T) => Array<Item>, elemCreator: (Item, String) => BaseJayElement<Item>, matchBy: string): ForEachWorker<T, Item> {
    return forEachWorkerContext(iid, () => {
        return {getItems, elemCreator: forEachElementCreatorWorkerContext(elemCreator), matchBy, iid}
    })
}

// export interface ConditionalWorker<ViewState> extends Conditional<ViewState> {
//     iid: number
// }
//
// export function conditionalWorker<ViewState>(iid: number, condition: (newData: ViewState) => boolean, elem: BaseJayElement<ViewState>): ConditionalWorker<ViewState> {
//     return {condition, elem, iid};
// }

export function childCompWorker<ParentT, Props, ChildT,
    ChildElement extends BaseJayElement<ChildT>, ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    iid: number,
    compCreator: (props: Props) => ChildComp,
    getProps: (t: ParentT) => Props,
    refName?: string): BaseJayElement<ParentT>{
    return childCompWorkerContext(iid, () => childComp(compCreator, getProps, refName));
}

