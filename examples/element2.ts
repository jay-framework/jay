const STYLE = 'style';
type updateConstructor<T> = (e:HTMLElement, newData:T, oldData:T) => void;
type updateFunc<T> = (newData:T) => void;
const noopUpdateConstructor: updateConstructor<any> = (e:HTMLElement, newData:any, oldData:any) => void {};
const noopUpdate: updateFunc<any> = (newData:any) => void {};

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

export function element<T>(
    tagName: string,
    attributes: any = {},
    children: Array<string | JayElement<T>> = [],
    initialData: T = undefined,
    update: (a:HTMLElement, b:T, c:T) => void = noopUpdateConstructor):
JayElement<T> {
    let e = document.createElement(tagName);
    setAttributes(e, attributes);

    let updates: updateFunc<T>[] = [];
    let oldData = initialData;
    if (update !== noopUpdateConstructor) {
        updates.push((newData: T) => {
            update(e, newData, oldData);
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
    if (updates.length > 0) {
        _update = (newData) => {
            updates.forEach(update => update(newData))
            oldData = newData;
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
