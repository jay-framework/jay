import {Kindergarten, KindergartenGroup} from "./kindergarden";
import {ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult} from "./list-compare";
import {RandomAccessLinkedList as List} from "./random-access-linked-list";
import {ReferencesManager} from "./node-reference";
import {ContextStack} from "./context-stack";
import {checkModified, getRevision} from "jay-reactive";
import {
    BaseJayElement,
    JayComponent,
    JayComponentConstructor,
    JayElement,
    MountFunc,
    noopMount,
    noopUpdate,
    updateFunc
} from "./element-types";
import './element-test-types';
import {JayEventHandlerWrapper} from "./node-reference-types";

const STYLE = 'style';
const REF = 'ref';

function mkRef(refName: string, referenced: HTMLElement | JayComponent<any, any, any>, updates: updateFunc<any>[], mounts: MountFunc[], unmounts: MountFunc[], isComp: boolean) {
    let context = currentContext();
    let [ref, update] = context.refManager.mkRef(referenced, context, refName, isComp);
    updates.push(update);
    if (context.forStaticElements) {
        context.refManager.addStaticRef(refName, ref);
    }
    else {
        let refManager = context.refManager;
        mounts.push(() => refManager.addDynamicRef(refName, ref))
        unmounts.push(() => refManager.removeDynamicRef(refName, ref))
    }
}

export function childComp<ParentT, Props, ChildT,
    ChildElement extends BaseJayElement<ChildT>, ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentT) => Props,
    refName?: string): BaseJayElement<ParentT> {
    let context = currentContext();
    let childComp = compCreator(getProps(context.currData))
    let updates: updateFunc<ParentT>[] = [(t: ParentT) => childComp.update(getProps(t))];
    let mounts: MountFunc[] = [childComp.mount]
    let unmounts: MountFunc[] = [childComp.unmount]
    if (refName) {
        mkRef(refName, childComp, updates, mounts, unmounts, true)
    }
    return {
        dom: childComp.element.dom,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts)
    }
}

export interface TextElement<ViewState> {
    dom: Text,
    update: updateFunc<ViewState>,
    mount: MountFunc,
    unmount: MountFunc
}

export interface DynamicAttributeOrProperty<ViewState, S> {
    valueFunc: (data:ViewState) => S;
    isAttribute: boolean
}

function isDynamicAttributeOrProperty<ViewState, S>(value: any): value is DynamicAttributeOrProperty<ViewState, S> {
    return typeof value.valueFunc === 'function';
}

export function dynamicAttribute<ViewState>(attributeValue: (data: ViewState) => string): DynamicAttributeOrProperty<ViewState, string> {
    return {valueFunc: attributeValue, isAttribute: true}
}

export function dynamicProperty<ViewState, S>(propertyValue: (data: ViewState) => S): DynamicAttributeOrProperty<ViewState, S> {
    return {valueFunc: propertyValue, isAttribute: false}
}

export type Attribute<ViewState, S> = string | DynamicAttributeOrProperty<ViewState, S> | Record<string, string | DynamicAttributeOrProperty<ViewState, S>>
export type Attributes<ViewState> = Record<string, Attribute<ViewState, any>>

function doSetAttribute<S>(target: HTMLElement | CSSStyleDeclaration, key: string, value: S, isAttribute: boolean) {
    if (target instanceof HTMLElement && isAttribute) {
        target.setAttribute(key, value as unknown as string);
    }
    else
        target[key] = value;
}
function setAttribute<ViewState, S>(target: HTMLElement | CSSStyleDeclaration, key: string, value: string | DynamicAttributeOrProperty<ViewState, S>, updates: updateFunc<ViewState>[]) {
    if (isDynamicAttributeOrProperty(value)) {
        let context = currentContext()
        let attributeValue = value.valueFunc(context.currData);
        doSetAttribute(target, key, attributeValue, value.isAttribute);
        updates.push((newData:ViewState) => {
            let newAttributeValue = value.valueFunc(newData);
            if (newAttributeValue !== attributeValue)
                doSetAttribute(target, key, newAttributeValue, value.isAttribute);
            attributeValue = newAttributeValue;
        });
    }
    else
        doSetAttribute(target, key, value, true);
}

export function conditional<ViewState>(condition: (newData: ViewState) => boolean, elem: BaseJayElement<ViewState> | TextElement<ViewState> | string): Conditional<ViewState> {
    if (typeof elem === 'string')
        return {condition, elem: text(elem)};
    else
        return {condition, elem};
}

export interface Conditional<ViewState> {
    condition: (newData: ViewState) => boolean,
    elem: BaseJayElement<ViewState> | TextElement<ViewState>
}

function isJayElement<ViewState>(c: Conditional<ViewState> | ForEach<ViewState, any> | TextElement<ViewState> | BaseJayElement<ViewState>): c is BaseJayElement<ViewState> {
    return (c as BaseJayElement<ViewState>).mount !== undefined;
}
export function isCondition<ViewState>(c: Conditional<ViewState> | ForEach<ViewState, any> | TextElement<ViewState> | BaseJayElement<ViewState>): c is Conditional<ViewState> {
    return (c as Conditional<ViewState>).condition !== undefined;
}

export function isForEach<ViewState, Item>(c: Conditional<ViewState> | ForEach<ViewState, Item> | TextElement<ViewState> | BaseJayElement<ViewState>): c is ForEach<ViewState, Item> {
    return (c as ForEach<ViewState, Item>).elemCreator !== undefined;
}

export function forEach<T, Item>(getItems: (T) => Array<Item>, elemCreator: (Item) => BaseJayElement<Item>, matchBy: string): ForEach<T, Item> {
    return {getItems, elemCreator, matchBy};
}

export interface ForEach<ViewState, Item> {
    getItems: (T) => Array<Item>,
    elemCreator: (Item, String) => BaseJayElement<Item>,
    matchBy: string
}

function applyListChanges<Item>(group: KindergartenGroup, instructions: Array<MatchResult<Item, BaseJayElement<Item>>>) {
    // todo add update
    instructions.forEach(instruction => {
        if (instruction.action === ITEM_ADDED) {
            group.ensureNode(instruction.elem.dom, instruction.pos)
            instruction.elem.mount()
        }
        else if (instruction.action === ITEM_REMOVED) {
            group.removeNodeAt(instruction.pos)
            instruction.elem.unmount();
        }
        else {
            group.moveNode(instruction.fromPos, instruction.pos)
        }
    });
}

export function mkUpdateCollectionInternal<ViewState, Item>(child: ForEach<ViewState, Item>, applyChanges: (instructions: Array<MatchResult<Item, BaseJayElement<Item>>>) => void): [updateFunc<ViewState>, MountFunc, MountFunc] {
    let lastItems = getRevision([]);
    let lastItemsList = new List<Item, BaseJayElement<Item>>([], child.matchBy);
    let mount = () => lastItemsList.forEach((value, attach) => attach.mount);
    let unmount = () => lastItemsList.forEach((value, attach) => attach.unmount);
    // todo handle data updates of the parent contexts
    let parentContext = currentContext();
    const update = (newData: ViewState) => {
        const items = child.getItems(newData);
        let isModified;
        [lastItems, isModified] = checkModified(items, lastItems);
        if (isModified) {
            let itemsList = new List<Item, BaseJayElement<Item>>(items, child.matchBy);
            let instructions = listCompare<Item, BaseJayElement<Item>>(lastItemsList, itemsList, (item, id) => {
                let childContext = parentContext.forItem(item);
                return constructionContextStack.doWithContext(childContext, () =>
                    wrapWithModifiedCheck(currentContext().currData, child.elemCreator(item, id)))
            });
            lastItemsList = itemsList;
            applyChanges(instructions)
            itemsList.forEach((value, elem) => elem.update(value))
        }
    };
    return [update, mount, unmount]
}

function mkUpdateCollection<ViewState, Item>(child: ForEach<ViewState, Item>, group: KindergartenGroup): [updateFunc<ViewState>, MountFunc, MountFunc] {
    return mkUpdateCollectionInternal(child, instructions => applyListChanges(group, instructions));
}


function mkUpdateCondition<ViewState>(child: Conditional<ViewState>, group: KindergartenGroup): [updateFunc<ViewState>, MountFunc, MountFunc] {

    let mount = noopMount, unmount = noopMount;
    if (isJayElement(child.elem) && child.elem.mount !== noopMount) {
        mount = () => (child.elem as BaseJayElement<ViewState>).mount()
        unmount = () => (child.elem as BaseJayElement<ViewState>).unmount()
    }
    let lastResult = false;
    const update = (newData: ViewState) => {
        let result = child.condition(newData);

        if (result) {
            if (!lastResult) {
                group.ensureNode(child.elem.dom)
                child.elem.mount();
            }
            child.elem.update(newData);
        } else if (lastResult) {
            group.removeNode(child.elem.dom)
            child.elem.unmount();
        }
        lastResult = result;
    };
    return [update, mount, unmount];
}

const constructionContextStack = new ContextStack<ConstructContext<Array<any>>>();

export function currentContext() {
    return constructionContextStack.current();
}

function wrapWithModifiedCheck<T extends object>(initialData: T, baseJayElement: BaseJayElement<T>): BaseJayElement<T> {
    let update = baseJayElement.update;
    let current = getRevision(initialData)
    let isModified;
    baseJayElement.update = (newData: T) => {
        [current, isModified] = checkModified(newData, current);
        if (isModified)
            update(current.value)
    }
    return baseJayElement;
}

export class ConstructContext<A extends Array<any>> {
    refManager: ReferencesManager
    data: A
    forStaticElements: boolean

    constructor(data: A,
                dynamicRefs: Array<string> = [],
                eventWrapper?: JayEventHandlerWrapper<any, any, any>,
                dm?: ReferencesManager,
                forStaticElements: boolean = true) {
        this.data = data;
        this.refManager = dm?dm:new ReferencesManager(dynamicRefs, eventWrapper);
        this.forStaticElements = forStaticElements;
    }

    get currData() {
        return this.data[this.data.length - 1];
    }

    coordinate(ref): string {
        return [...this.data
          .slice(1)
          .map(_ => _.id)
          .reverse(), ref]
          .join('/');
    }

    static acc<A extends Array<any>, B>(a: A, b: B): [...A, B] {
        return [...a, b]
    }

    forItem<T>(t: T) {
        return new ConstructContext(ConstructContext.acc(this.data, t), [], undefined, this.refManager, false)
    }

    static withRootContext<ViewState, Refs>(viewState: ViewState,
                                            elementConstructor: () => BaseJayElement<ViewState>,
                                            dynamicRefs?: Array<string>,
                                            eventWrapper?: JayEventHandlerWrapper<any, any, any>):
      JayElement<ViewState, Refs> {
        let context = new ConstructContext([viewState], dynamicRefs, eventWrapper)
        let element = constructionContextStack.doWithContext(context, () =>
          wrapWithModifiedCheck(currentContext().currData, elementConstructor()))
        element.mount();
        return context.refManager.applyToElement(element);
    }
}

function text<ViewState>(content: string): TextElement<ViewState> {
    return {
        dom: document.createTextNode(content),
        update: noopUpdate,
        mount: noopMount,
        unmount: noopMount
    }
}

export function dynamicText<ViewState>(
                               textContent: (vs) => string): TextElement<ViewState> {
    let context = currentContext();
    let content = textContent(context.currData);
    let n = document.createTextNode(content);
    return {
        dom: n,
        update: (newData:ViewState) => {
            let newContent = textContent(newData);
            if (newContent !== content)
                n.textContent = newContent;
            content = newContent;
        },
        mount: noopMount,
        unmount: noopMount
    }
}

export function element<ViewState>(
    tagName: string,
    attributes: Attributes<ViewState>,
    children: Array<BaseJayElement<ViewState> | TextElement<ViewState> | string> = []):
    BaseJayElement<ViewState> {
    let {e, updates, mounts, unmounts} = createBaseElement(tagName, attributes);
    
    children.forEach(child => {
        if (typeof child === 'string')
            child = text(child);
        e.append(child.dom);
        if (child.update !== noopUpdate)
            updates.push(child.update);
        if (child.mount !== noopMount) {
            mounts.push(child.mount);
            unmounts.push(child.unmount);
        }
    });
    return {
        dom: e,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts)
    };
}

export function dynamicElement<ViewState>(
    tagName: string,
    attributes: Attributes<ViewState>,
    children: Array<Conditional<ViewState> | ForEach<ViewState, any> | TextElement<ViewState> | BaseJayElement<ViewState> | string> = []):
    BaseJayElement<ViewState> {
    let {e, updates, mounts, unmounts} = createBaseElement(tagName, attributes);

    let kindergarten = new Kindergarten(e);
    children.forEach(child => {
        if (typeof child === 'string')
            child = text(child);
        let group = kindergarten.newGroup();
        let update = noopUpdate, mount = noopMount, unmount = noopMount;
        if (isCondition(child)) {
            [update, mount, unmount] = mkUpdateCondition(child, group)
        }
        else if (isForEach(child)){
            [update, mount, unmount] = mkUpdateCollection(child, group);
        }
        else  {
            group.ensureNode(child.dom)
            if (child.update !== noopUpdate)
                update = child.update;
            if (child.mount !== noopMount) {
                mount = child.mount;
                unmount = child.unmount;
            }
        }

        if (update !== noopUpdate) {
            let context = currentContext();
            update(context.currData)
            updates.push(update);
        }

        if (mount !== noopMount) {
            mounts.push(mount);
            unmounts.push(unmount);
        }
    })

    return {
        dom: e,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts)
    };
}

function createBaseElement<ViewState>(tagName: string, attributes: Attributes<ViewState>):
    {e: HTMLElement, updates: updateFunc<ViewState>[], mounts: MountFunc[], unmounts: MountFunc[]} {
    let e = document.createElement(tagName);
    let updates: updateFunc<ViewState>[] = [];
    let mounts: MountFunc[] = []
    let unmounts: MountFunc[] = []
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                setAttribute(e.style, styleKey, styleValue as string | DynamicAttributeOrProperty<ViewState, any>, updates);
            })
        }
        else if (key === REF) {
            mkRef(value as string, e, updates, mounts, unmounts, false)
        }
        else {
            setAttribute(e, key, value as string | DynamicAttributeOrProperty<ViewState, any>, updates);
        }
    });
    return {e, updates, mounts, unmounts};
}

export function normalizeUpdates<ViewState>(updates: Array<updateFunc<ViewState>>): updateFunc<ViewState> {
    if (updates.length === 1)
        return updates[0];
    else if (updates.length > 0) {
        for (let i = updates.length - 1; i >= 0; i--) {
            if (updates[i]._origUpdates)
                updates.splice(i, 1, ...updates[i]._origUpdates);
        }
        let updateFunc: updateFunc<ViewState>  = (newData) => {
            updates.forEach(__update => __update(newData))
        };
        updateFunc._origUpdates = updates;
        return updateFunc;
    }
    else {
        return noopUpdate
    }
}

export function normalizeMount(mounts: Array<MountFunc>): MountFunc {
    if (mounts.length === 1)
        return mounts[0];
    else if (mounts.length > 0) {
        return () => {
            mounts.forEach(__update => __update())
        };
    }
    else {
        return noopMount
    }
}
