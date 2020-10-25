import { JSDOM } from 'jsdom';
import {Kindergarden} from '../../src/shared/kindergarden';

function makeParent(): HTMLElement {
    const { window } = new JSDOM(`<!DOCTYPE html><html><body><div id="parent"></div></body></html>`);
    const document = window.document;
    return {document, parent: document.getElementById('parent')};
}

function makeNode(document, text: string): HTMLElement {
    let elem = document.createElement('div');
    elem.textContent = text;
    return elem;
}

describe('Kindergarden', () => {

    test('add a node in a group', () => {

        let {document, parent} = makeParent();
        let kindergarden = new Kindergarden(parent);
        let group1 = kindergarden.newGroup();
        let node1 = makeNode(document, 'text1');
        group1.ensureNode(node1);

        expect(parent.childNodes[0]).toEqual(node1);
    });

    test('add and remove a node in a group', () => {

        let {document, parent} = makeParent();
        let kindergarden = new Kindergarden(parent);
        let group1 = kindergarden.newGroup();
        let node1 = makeNode(document, 'text1');
        group1.ensureNode(node1);
        group1.removeNode(node1);

        expect(parent.childNodes.length).toEqual(0);
    });
})
