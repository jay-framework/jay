const STYLE = 'style';

export function element(tagName: string, attributes: any = {}, children: Array<HTMLElement | string> = []): HTMLElement {
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
    return e;
}

