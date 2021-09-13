import {Kindergarten, KindergartenGroup} from "./kindergarden";
import {ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult} from "./list-compare";
import {RandomAccessLinkedList as List} from "./random-access-linked-list";
import {ElementReference, ReferencesManager} from "./node-reference";
export {DynamicReference} from "./node-reference";

const STYLE = 'style';
const REF = 'ref';
type updateFunc<T> = (newData:T) => void;
type mountFunc = () => void;
export const noopUpdate: updateFunc<any> = (_newData:any): void => {};
export const noopMount: mountFunc = (): void => {}

export interface JayElement<T> {
    dom: HTMLElement,
    update: updateFunc<T>
    mount: mountFunc,
    unmount: mountFunc
}

export interface JayComponent<P, T, S extends JayElement<T>>{
    element: S
    update: updateFunc<P>
    mount: mountFunc,
    unmount: mountFunc
}

export function childComp<ParentT, A extends Array<any>, Props, ChildT,
    ChildElementVS extends JayElement<ChildT>, ChildComp extends JayComponent<Props, ChildT, ChildElementVS>>(
    compCreator: (props: Props) => ChildComp,
    getProps: (t: ParentT) => Props,
    context: ConstructContext<A>): JayElement<ParentT> {
    let childComp = compCreator(getProps(context.currData))
    return {
        dom: childComp.element.dom,
        update: (t: ParentT) => childComp.update(getProps(t)),
        mount: childComp.mount,
        unmount: childComp.unmount
    }
}

export interface TextElement<T> {
    dom: Text,
    update: updateFunc<T>,
    mount: mountFunc,
    unmount: mountFunc
}

export interface DynamicAttribute<T> {
    initialData: T
    attributeValue: (data:T) => string;
}

function isDynamicAttribute<T>(value: any): value is DynamicAttribute<T> {
    return typeof value.attributeValue === 'function';
}

export function dynamicAttribute<T, S>(initialData: T, attributeValue: (data: T) => string): DynamicAttribute<T> {
    return {initialData, attributeValue}
}

export type Attribute<T> = string | DynamicAttribute<T> | Record<string, string | DynamicAttribute<T>>
export type Attributes<T> = Record<string, Attribute<T>>

function doSetAttribute(target: HTMLElement | CSSStyleDeclaration, key: string, value: string) {
    if (target instanceof HTMLElement) {
        if (key === 'className')
            target.setAttribute('class', value);
        else if (key === 'textContent')
            target.textContent = value;
        else
            target.setAttribute(key, value);
    }
    else
        target[key] = value;
}
function setAttribute<T>(target: HTMLElement | CSSStyleDeclaration, key: string, value: string | DynamicAttribute<T>, updates: updateFunc<T>[]) {
    if (isDynamicAttribute(value)) {
        let dynamicAttribute = value as DynamicAttribute<T>
        let attributeValue = dynamicAttribute.attributeValue(dynamicAttribute.initialData);
        doSetAttribute(target, key, attributeValue);
        updates.push((newData:T) => {
            let newAttributeValue = dynamicAttribute.attributeValue(newData);
            if (newAttributeValue !== attributeValue)
                doSetAttribute(target, key, newAttributeValue);
            attributeValue = newAttributeValue;
        });
    }
    else
        doSetAttribute(target, key, value);
}

export function conditional<T>(condition: (newData: T) => boolean, elem: JayElement<T> | TextElement<T> | string): Conditional<T> {
    if (typeof elem === 'string')
        return {condition, elem: text(elem)};
    else
        return {condition, elem};
}

export interface Conditional<T> {
    condition: (newData: T) => boolean,
    elem: JayElement<T> | TextElement<T>
}

function isJayElement<T>(c: Conditional<T> | ForEach<T, any> | TextElement<T> | JayElement<T>): c is JayElement<T> {
    return (c as JayElement<T>).mount !== undefined;
}
function isCondition<T>(c: Conditional<T> | ForEach<T, any> | TextElement<T> | JayElement<T>): c is Conditional<T> {
    return (c as Conditional<T>).condition !== undefined;
}

function isForEach<T, S>(c: Conditional<T> | ForEach<T, S> | TextElement<T> | JayElement<T>): c is ForEach<T, S> {
    return (c as ForEach<T, S>).elemCreator !== undefined;
}

export function forEach<T, Item>(getItems: (T) => Array<Item>, elemCreator: (Item) => JayElement<Item>, matchBy: string): ForEach<T, Item> {
    return {getItems, elemCreator, matchBy};
}

export interface ForEach<T, Item> {
    getItems: (T) => Array<Item>,
    elemCreator: (Item) => JayElement<Item>,
    matchBy: string
}

function applyListChanges<Item>(group: KindergartenGroup, instructions: Array<MatchResult<Item>>) {
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

function mkUpdateCollection<T>(child: ForEach<T, any>, group: KindergartenGroup): [updateFunc<T>, mountFunc, mountFunc] {
    let lastItems = new List<T, JayElement<T>>([], child.matchBy);
    let mount = () => lastItems.forEach((value, attach) => attach.mount);
    let unmount = () => lastItems.forEach((value, attach) => attach.unmount);
    const update = (newData: T) => {
        const items = child.getItems(newData);
        let itemsList = new List<T, JayElement<T>>(items, child.matchBy);
        let instructions = listCompare<T>(lastItems, itemsList, child.elemCreator);
        lastItems = itemsList;
        applyListChanges(group, instructions);
        itemsList.forEach((value, elem) => elem.update(value))
    };
    return [update, mount, unmount]
}

function mkUpdateCondition<T>(child: Conditional<T>, group: KindergartenGroup): [updateFunc<T>, mountFunc, mountFunc] {

    let mount = noopMount, unmount = noopMount;
    if (isJayElement(child.elem) && child.elem.mount !== noopMount) {
        mount = () => (child.elem as JayElement<T>).mount()
        unmount = () => (child.elem as JayElement<T>).unmount()
    }
    let lastResult = false;
    const update = (newData: T) => {
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

    static withRootContext<T, A extends ConstructContext<[T]>>(t: T, elementConstructor: (A) => JayElement<T>) {
        let context = new ConstructContext([t])
        let element = elementConstructor(context);
        element.mount();
        return context.refManager.applyToElement(element);
    }
}

function text<T>(content: string): TextElement<T> {
    return {
        dom: document.createTextNode(content),
        update: noopUpdate,
        mount: noopMount,
        unmount: noopMount
    }
}

export function dynamicText<T, A extends Array<any>>(context: ConstructContext<A>,
                               textContent: (T) => string): TextElement<T> {
    let content = textContent(context.currData);
    let n = document.createTextNode(content);
    return {
        dom: n,
        update: (newData:T) => {
            let newContent = textContent(newData);
            if (newContent !== content)
                n.textContent = newContent;
            content = newContent;
        },
        mount: noopMount,
        unmount: noopMount
    }
}

export function element<T, A extends Array<any>>(
    tagName: string,
    attributes: Attributes<T>,
    children: Array<JayElement<T> | TextElement<T> | string> = [],
    context?: ConstructContext<A>):
    JayElement<T> {
    let {e, updates, mounts, unmounts} = createBaseElement(tagName, attributes, context);
    
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

export function dynamicElement<T, A extends Array<any>>(
    tagName: string,
    attributes: Attributes<T>,
    children: Array<Conditional<T> | ForEach<T, any> | TextElement<T> | JayElement<T> | string> = [],
    context?: ConstructContext<A>):
    JayElement<T> {
    let {e, updates, mounts, unmounts} = createBaseElement(tagName, attributes, context);

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

function createBaseElement<T, A extends Array<any>>(tagName: string, attributes: Attributes<T>, context: ConstructContext<A>):
    {e: HTMLElement, updates: updateFunc<T>[], mounts: mountFunc[], unmounts: mountFunc[]} {
    let e = document.createElement(tagName);
    let updates: updateFunc<T>[] = [];
    let mounts: mountFunc[] = []
    let unmounts: mountFunc[] = []
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                setAttribute(e.style, styleKey, styleValue as string | DynamicAttribute<T>, updates);
            })
        }
        else if (key === REF) {
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
            setAttribute(e, key, value as string | DynamicAttribute<T>, updates);
        }
    });
    return {e, updates, mounts, unmounts};
}

function normalizeUpdates<T>(updates: Array<updateFunc<T>>): updateFunc<T> {
    if (updates.length === 1)
        return updates[0];
    else if (updates.length > 0) {
        return (newData) => {
            updates.forEach(__update => __update(newData))
        };
    }
    else {
        return noopUpdate
    }
}

function normalizeMount(mounts: Array<mountFunc>): mountFunc {
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
