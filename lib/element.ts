import {Kindergarten, KindergartenGroup} from "./kindergarden";
import {ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult} from "./list-compare";
import {EoF, RandomAccessLinkedList, RandomAccessLinkedList as List} from "./random-access-linked-list";

const STYLE = 'style';
type updateConstructor<T, S> = (e:HTMLElement, newData:T, state: S) => S;
type updateFunc<T> = (newData:T) => void;
const noopUpdateConstructor: updateConstructor<any, any> = (e:HTMLElement, newData:any, state: any): any => {};
export const noopUpdate: updateFunc<any> = (newData:any): void => {};

export interface JayElement<T> {
    dom: HTMLElement,
    update: updateFunc<T>
}

function setAttributes(e: HTMLElement, attributes: any) {
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                e.style[styleKey] = styleValue;
            })
        }
        else
            e[key] = value;
    });
}

function createBaseElement(tagName: string, attributes: any = {}) {
    let e = document.createElement(tagName);
    setAttributes(e, attributes);
    return e;
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

export function textElement<T>(tagName: string,
                                  attributes: any = {}, initialData: T, textContent: (T) => string) {
    let text = textContent(initialData);
    return element<T, string>(tagName, attributes, [text], initialData, text, updateTextContent(textContent));
}

export function element<T, S>(
    tagName: string,
    attributes: any = {},
    children: Array<string | JayElement<T>> = [],
    initialData: T = undefined,
    initialState: S = undefined,
    update: updateConstructor<T, S> = noopUpdateConstructor):
    JayElement<T> {
    let e = createBaseElement(tagName, attributes);
                    6
    let updates: updateFunc<T>[] = [];
    let state: S = initialState;
    if (update !== noopUpdateConstructor) {
        updates.push((newData: T) => {
            state = update(e, newData, state);
        })
    }
    children.forEach(child => {
        if (typeof child === 'string')
            e.append(child);
        else {
            e.append(child.dom);
            if (child.update !== noopUpdate)
                updates.push(child.update);
        }
    });

    return {
        dom: e,
        update: normalizeUpdates(updates)
    };
}

export function conditional<T>(condition: (newData: T) => boolean, elem: JayElement<T>): Conditional<T> {
    return {condition, elem};
}

export interface Conditional<T> {
    condition: (newData: T) => boolean,
    elem: JayElement<T>
}

function isCondition<T>(c: Conditional<T> | ForEach<T, any>): c is Conditional<T> {
    return (c as Conditional<T>).condition !== undefined;
}

export function forEach<T, Item>(getItems: (T) => Array<Item>, elemCreator: (Item) => JayElement<Item>, matchBy: string): ForEach<T, Item> {
    return {getItems, elemCreator, matchBy};
}

export interface ForEach<T, Item> {
    getItems: (T) => Array<Item>,
    elemCreator: (Item) => JayElement<Item>,
    matchBy: string
}

function applyListChanges<Item>(group: KindergartenGroup, instructions: Array<MatchResult<Item, JayElement<Item>>>) {
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
        let instructions = listCompare<T, JayElement<T>>(lastItems, itemsList, child.elemCreator);
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
            child.elem.update(newData)
        } else
            group.removeNode(child.elem.dom)
    };
}

export function dynamicElement<T, S>(
    tagName: string,
    attributes: any = {},
    children: Array<Conditional<T> | ForEach<T, any>> = [],
    initialData: T = undefined,
    initialState: S = undefined,
    update: updateConstructor<T, S> = noopUpdateConstructor):
    JayElement<T> {
    let e = createBaseElement(tagName, attributes);

    let updates: updateFunc<T>[] = [];

    let state: S = initialState;
    if (update !== noopUpdateConstructor) {
        updates.push((newData: T) => {
            state = update(e, newData, state);
        })
    }

    let kindergarden = new Kindergarten(e);
    children.forEach(child => {
        let group = new KindergartenGroup(kindergarden);
        let update;
        if (isCondition(child)) {
            update = mkUpdateCondition(child, group)
        }
        else {
            update = mkUpdateCollection(child, group);
        }
        update(initialData)
        updates.push(update);
    })

    return {
        dom: e,
        update: normalizeUpdates(updates)
    };
}

export function updateTextContent<T>(getState: (T) => string): updateConstructor<T, string> {
    return (elem:HTMLElement, newData:T, state: string) =>  {
        let newContent = getState(newData);
        if (state !== newContent)
            elem.textContent = newContent;
        return newContent;
    };
}
