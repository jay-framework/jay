const STYLE = 'style';

export interface JayElement<T> {
    dom: HTMLElement,
    update: (data: T) => void
}

export function element<T>(
    tagName: string,
    attributes: any = {},
    children: Array<HTMLElement | string> = [],
    initialData: T,
    update: (a:HTMLElement, b:T, c:T) => void = undefined): JayElement<T> {
    let e = document.createElement(tagName);
    e.append(...children);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                e.style[styleKey] = styleValue;
            })
        }
        else
            e[key] = value;
    });
    let oldData = initialData;
    let _update = (newData) => {
        update(e, newData, oldData);
        oldData = newData;
    }
    return {
        dom: e,
        update: _update
    };
}

