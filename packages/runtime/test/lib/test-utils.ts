import {JSDOM} from "jsdom";

export function makeNode(document, text: string): HTMLElement {
    let elem = document.createElement('div');
    elem.textContent = text;
    return elem;
}

export function makeParent(): {document: Document, parent: HTMLElement} {
    const { window } = new JSDOM(`<!DOCTYPE html><html><body><div id="parent"></div></body></html>`);
    const document = window.document;
    return {document, parent: document.getElementById('parent')};
}


export function expectE<T>(t: T): jest.Matchers<T, any> {
    return expect(t) as any as jest.Matchers<T, any>
}

