import {Kindergarten, KindergartenGroup} from "./kindergarden";

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

export function element<T, S>(
    tagName: string,
    attributes: any = {},
    children: Array<string | JayElement<T>> = [],
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

export function dynamicElement<T, S>(
    tagName: string,
    attributes: any = {},
    children: Array<Conditional<T>> = [],
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
        let update = (newData: T) => {
            let result = child.condition(newData);
            if (result) {
                group.ensureNode(child.elem.dom)
                child.elem.update(newData)
            }
            else
                group.removeNode(child.elem.dom)
        }
        update(initialData)
        updates.push(update);
    })

    return {
        dom: e,
        update: normalizeUpdates(updates)
    };
}
