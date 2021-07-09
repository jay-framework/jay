import {Kindergarten, KindergartenGroup} from "./kindergarden";
import {ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult} from "./list-compare";
import {EoF, RandomAccessLinkedList, RandomAccessLinkedList as List} from "./random-access-linked-list";
import {ElementReference, ReferencesManager} from "./node-reference";

const STYLE = 'style';
const REF = 'ref';
type updateFunc<T> = (newData:T) => void;
export const noopUpdate: updateFunc<any> = (_newData:any): void => {};

export interface JayElement<T> {
    dom: HTMLElement,
    update: updateFunc<T>
}

export interface TextElement<T> {
    dom: Text,
    update: updateFunc<T>
}

export interface DynamicAttribute<T> {
    initialData: T
    attributeValue: (data:T) => string;
}

function isDynamicAttribute(value: any) {
    return typeof value.attributeValue === 'function';
}

export function dynamicAttribute<T, S>(initialData: T, attributeValue: (data: T) => string): DynamicAttribute<T> {
    return {initialData, attributeValue}
}

export type Attribute<T> = string | DynamicAttribute<T> | Record<string, string | DynamicAttribute<T>>
export type Attributes<T> = Record<string, Attribute<T>>

function setAttribute<T>(target: HTMLElement | CSSStyleDeclaration, key: string, value: string | DynamicAttribute<T>, updates: updateFunc<T>[]) {
    if (isDynamicAttribute(value)) {
        let dynamicAttribute = value as DynamicAttribute<T>
        let attributeValue = dynamicAttribute.attributeValue(dynamicAttribute.initialData);
        target[key] = attributeValue;
        updates.push((newData:T) => {
            let newAttributeValue = dynamicAttribute.attributeValue(newData);
            if (newAttributeValue !== attributeValue)
                target[key] = newAttributeValue;
            attributeValue = newAttributeValue;
        });
    }
    else
        target[key] = value;
}

function createBaseElement<T>(tagName: string, attributes: Attributes<T>): {e: HTMLElement, updates: updateFunc<T>[], refId?: string} {
    let e = document.createElement(tagName);
    let refId = undefined;
    let updates: updateFunc<T>[] = [];
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                setAttribute(e.style, styleKey, styleValue as string | DynamicAttribute<T>, updates);
            })
        }
        else if (key === REF) {
            refId = value;
        }
        else {
            setAttribute(e, key, value as string | DynamicAttribute<T>, updates);
        }
    });
    return {e, updates, refId};
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
        }
        else if (instruction.action === ITEM_REMOVED) {
            group.removeNodeAt(instruction.pos)
        }
        else {
            group.moveNode(instruction.fromPos, instruction.pos)
        }
    });
}

function updateListItems<T>(itemsList: RandomAccessLinkedList<T, JayElement<T>>) {
    let listItem = itemsList.first();
    while (listItem !== EoF) {
        listItem.attach.update(listItem.value);
        listItem = listItem.next;
    }

}

function mkUpdateCollection<T>(child: ForEach<T, any>, group: KindergartenGroup) {
    let lastItems = new List<T, JayElement<T>>([], child.matchBy);
    return (newData: T) => {
        const items = child.getItems(newData);
        let itemsList = new List<T, JayElement<T>>(items, child.matchBy);
        let instructions = listCompare<T>(lastItems, itemsList, child.elemCreator);
        lastItems = itemsList;
        applyListChanges(group, instructions);
        updateListItems(itemsList);
    }
}

function mkUpdateCondition<T>(child: Conditional<T>, group: KindergartenGroup) {
    return (newData: T) => {
        let result = child.condition(newData);

        if (result) {
            group.ensureNode(child.elem.dom)
            child.elem.update(newData);
        } else
            group.removeNode(child.elem.dom)
    };
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

    forCondition<T>() {
        return new ConstructContext(this.data, this.refManager, false)
    }

    static from<B extends Array<any>, T>(context: ConstructContext<B>, t: T) {
        return new ConstructContext(ConstructContext.acc(context.data, t), context.refManager, false)
    }

    static root<T>(t: T): ConstructContext<[T]> {
        return new ConstructContext([t])
    }

    static withRootContext<T, A extends ConstructContext<[T]>>(t: T, elementConstructor: (A) => JayElement<T>) {
        let context = new ConstructContext([t])
        let element = elementConstructor(context);
        return context.refManager.applyToElement(element);
    }
}

function text<T>(content: string): TextElement<T> {
    return {
        dom: document.createTextNode(content),
        update: noopUpdate
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
        }
    }
}

export function element<T, A extends Array<any>>(
    tagName: string,
    attributes: Attributes<T>,
    children: Array<JayElement<T> | TextElement<T> | string> = [],
    context?: ConstructContext<A>):
    JayElement<T> {
    let {e, updates, refId} = createBaseElement(tagName, attributes);
    
    children.forEach(child => {
        if (typeof child === 'string')
            child = text(child);
        e.append(child.dom);
        if (child.update !== noopUpdate)
            updates.push(child.update);
    });
    return constructJayElement(refId, e, context, updates);
}

export function dynamicElement<T, A extends Array<any>>(
    tagName: string,
    attributes: Attributes<T>,
    children: Array<Conditional<T> | ForEach<T, any> | TextElement<T> | JayElement<T> | string> = [],
    context?: ConstructContext<A>):
    JayElement<T> {
    let {e, updates, refId} = createBaseElement(tagName, attributes);

    let kindergarten = new Kindergarten(e);
    children.forEach(child => {
        if (typeof child === 'string')
            child = text(child);
        let group = kindergarten.newGroup();
        let update = null;
        if (isCondition(child)) {
            update = mkUpdateCondition(child, group)
        }
        else if (isForEach(child)){
            update = mkUpdateCollection(child, group);
        }
        else  {
            group.ensureNode(child.dom)
            if (child.update !== noopUpdate)
                update = child.update;
        }

        if (update !== null) {
            update(context.data[0])
            updates.push(update);
        }
    })

    return constructJayElement(refId, e, context, updates);
}

function constructJayElement<T, A extends Array<any>>(refId: string, e: HTMLElement, context: ConstructContext<A>, updates: updateFunc<T>[]) {
    if (refId) {
        // move ref creation to mount and unmount
        if (context.forStaticElements) {
            context.refManager.addStaticRef(refId, e)
        }
        else {
            let ref = new ElementReference(e, context.currData)
            updates.push(ref.update);
            context.refManager.addDynamicRef(refId, ref)
        }
    }
    return {
        dom: e,
        update: normalizeUpdates(updates)
    };
}

