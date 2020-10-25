import { JSDOM } from 'jsdom';
import {Kindergarten} from '../../examples/kindergarden';

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

describe('Kindergarten', () => {

    describe('Kindergarten one conditional group', () => {

        test('add a node in a group', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            group1.ensureNode(node1);

            expect(parent.childNodes[0]).toEqual(node1);
        });

        test('add a node twice - the node should be once', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            group1.ensureNode(node1);
            group1.ensureNode(node1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes.length).toEqual(1);
        });

        test('add and remove a node in a group', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            group1.ensureNode(node1);
            group1.removeNode(node1);

            expect(parent.childNodes.length).toEqual(0);
        });
    });

    describe('Kindergarten preserves the ordering between groups', () => {
        test('add nodes group1, group 2', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            group1.ensureNode(node1);
            group2.ensureNode(node2);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node2);
        });

        test('do not allow removing nodes of another group', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            group1.ensureNode(node1);
            group2.ensureNode(node2);

            expect(parent.childNodes.length).toEqual(2);

        });

        test('add nodes group2, group 1', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            group2.ensureNode(node2);
            group1.ensureNode(node1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node2);
        });
        test('group 1, group 2, group 3, add nodes to groups 1, 2, 3, then remove node 2, node 1, then add node 1', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let group3 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group2.ensureNode(node2);
            group3.ensureNode(node3);
            group2.removeNode(node2);
            group1.removeNode(node1);
            group1.ensureNode(node1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node3);
        });

    });

    describe('Kindergarten one collection group', () => {

        test.skip('add nodes in a group', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group1.ensureNode(node2);
            group1.ensureNode(node3);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node2);
            expect(parent.childNodes[2]).toEqual(node3);
        });

        test.skip('move node - 3rd to 2nd', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group1.ensureNode(node2);
            group1.ensureNode(node3);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node2);
            expect(parent.childNodes[2]).toEqual(node3);
        });
    });
});
