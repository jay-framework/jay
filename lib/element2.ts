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

export function element<T, S>(
    tagName: string,
    attributes: any = {},
    children: Array<string | JayElement<T>> = [],
    initialData: T = undefined,
    initialState: S = undefined,
    update: updateConstructor<T, S> = noopUpdateConstructor):
JayElement<T> {
    let e = document.createElement(tagName);
    setAttributes(e, attributes);

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

    let _update;
    if (updates.length === 1)
        _update = updates[0];
    else if (updates.length > 0) {
        _update = (newData) => {
            updates.forEach(__update => __update(newData))
        };
    }
    else {
        _update = noopUpdate
    }
    return {
        dom: e,
        update: _update
    };
}

// export function dynamicElement<T>(
//     tagName: string,
//     attributes: any = {},
//     children: Array<string | Conditional> = [],
//     initialData: T,
//     update: (a:HTMLElement, b:T, c:T) => void = undefined):
// JayElement<T> {
//     let e = document.createElement(tagName);
//     e.append(...children);
//     setAttributes(e, attributes);
//
//     let oldData = initialData;
//
//     let _update = (newData) => {
//         update(e, newData, oldData);
//         oldData = newData;
//     };
//     return {
//         dom: e,
//         update: _update
//     };
// }
//
// export function conditional<T>(condition: (newData: T) => boolean, elem: JayElement<T>): Conditional {
//
// }
//
// export interface Conditional {
//
// }
