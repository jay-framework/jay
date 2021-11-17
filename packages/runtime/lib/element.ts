import {Kindergarten, KindergartenGroup} from "./kindergarden";
import {ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult} from "./list-compare";
import {RandomAccessLinkedList as List} from "./random-access-linked-list";
import {ElementReference, ReferencesManager} from "./node-reference";
import {ContextStack} from "./context-stack";
export {ContextStack} from "./context-stack";
export {DynamicReference} from "./node-reference";
export {Revisioned, checkModified, touchRevision} from "jay-reactive";
import {getRevision, checkModified} from "jay-reactive";

const STYLE = 'style';
const REF = 'ref';
interface updateFunc<T> {
    (newData:T): void
    _origUpdates?: Array<updateFunc<T>>
}
//type updateFunc<T> = (newData:T) => void;
export type MountFunc = () => void;
export const noopUpdate: updateFunc<any> = (_newData:any): void => {};
export const noopMount: MountFunc = (): void => {}

export interface BaseJayElement<ViewState> {
    dom: HTMLElement,
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
}

export interface JayElement<ViewState, Refs> extends BaseJayElement<ViewState>{
    refs: Refs
}

export interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>>{
    element: jayElement
    update: updateFunc<Props>
    mount: MountFunc,
    unmount: MountFunc
}

export function childComp<ParentT, Props, ChildT,
    ChildElement extends BaseJayElement<ChildT>, ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    compCreator: (props: Props) => ChildComp,
    getProps: (t: ParentT) => Props): BaseJayElement<ParentT> {
    let context = constructionContextStack.current();
    let childComp = compCreator(getProps(context.currData))
    return {
        dom: childComp.element.dom,
        update: (t: ParentT) => childComp.update(getProps(t)),
        mount: childComp.mount,
        unmount: childComp.unmount
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
        let context = constructionContextStack.current()
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
function isCondition<ViewState>(c: Conditional<ViewState> | ForEach<ViewState, any> | TextElement<ViewState> | BaseJayElement<ViewState>): c is Conditional<ViewState> {
    return (c as Conditional<ViewState>).condition !== undefined;
}

function isForEach<ViewState, Item>(c: Conditional<ViewState> | ForEach<ViewState, Item> | TextElement<ViewState> | BaseJayElement<ViewState>): c is ForEach<ViewState, Item> {
    return (c as ForEach<ViewState, Item>).elemCreator !== undefined;
}

export function forEach<T, Item>(getItems: (T) => Array<Item>, elemCreator: (Item) => BaseJayElement<Item>, matchBy: string): ForEach<T, Item> {
    return {getItems, elemCreator, matchBy};
}

export interface ForEach<ViewState, Item> {
    getItems: (T) => Array<Item>,
    elemCreator: (Item) => BaseJayElement<Item>,
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

function mkUpdateCollection<ViewState, Item>(child: ForEach<ViewState, Item>, group: KindergartenGroup): [updateFunc<ViewState>, MountFunc, MountFunc] {
    let lastItems = new List<Item, BaseJayElement<Item>>([], child.matchBy);
    let mount = () => lastItems.forEach((value, attach) => attach.mount);
    let unmount = () => lastItems.forEach((value, attach) => attach.unmount);
    // todo handle data updates of the parent contexts
    let parentContext = constructionContextStack.current();
    const update = (newData: ViewState) => {
        const items = child.getItems(newData);
        let itemsList = new List<Item, BaseJayElement<Item>>(items, child.matchBy);
        let instructions = listCompare<Item, BaseJayElement<Item>>(lastItems, itemsList, (item) => {
            let childContext = parentContext.forItem(item);
            return constructionContextStack.doWithContext(childContext, () =>
                wrapWithModifiedCheck(constructionContextStack.current().currData, child.elemCreator(item)))
        });
        lastItems = itemsList;
        applyListChanges(group, instructions);
        itemsList.forEach((value, elem) => elem.update(value))
    };
    return [update, mount, unmount]
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

    constructor(data: A, dm?: ReferencesManager, forStaticElements: boolean = true) {
        this.data = data;
        this.refManager = dm?dm:new ReferencesManager();
        this.forStaticElements = forStaticElements;
    }

    get currData() {
        return this.data[this.data.length - 1];
    }

    static acc<A extends Array<any>, B>(a: A, b: B): [...A, B] {
        return [...a, b]
    }

    forItem<T>(t: T) {
        return new ConstructContext(ConstructContext.acc(this.data, t), this.refManager, false)
    }

    static root<T>(t: T): ConstructContext<[T]> {
        return new ConstructContext([t])
    }

    static withRootContext<T, Refs>(t: T, elementConstructor: () => BaseJayElement<T>): JayElement<T, Refs> {
        let context = new ConstructContext([t])
        let element = constructionContextStack.doWithContext(context, () =>
            wrapWithModifiedCheck(constructionContextStack.current().currData, elementConstructor()))
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
    let context = constructionContextStack.current();
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
            let context = constructionContextStack.current();
            update(context.data[0])
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
            let context = constructionContextStack.current();
            if (context.forStaticElements) {
                context.refManager.addStaticRef(value as string, e)
            }
            else {
                let ref = new ElementReference(e, context.currData)
                updates.push(ref.update);
                let refManager = context.refManager;
                mounts.push(() => refManager.addDynamicRef(value as string, ref))
                unmounts.push(() => refManager.removeDynamicRef(value as string, ref))
            }
        }
        else {
            setAttribute(e, key, value as string | DynamicAttributeOrProperty<ViewState, any>, updates);
        }
    });
    return {e, updates, mounts, unmounts};
}

function normalizeUpdates<ViewState>(updates: Array<updateFunc<ViewState>>): updateFunc<ViewState> {
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

function normalizeMount(mounts: Array<MountFunc>): MountFunc {
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
