import { JSDOM } from 'jsdom';
import {Kindergarten} from '../../lib/kindergarden';
import {describe, expect, test} from '@jest/globals'

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

        test('add and remove by position a node in a group', () => {

            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            group1.ensureNode(node1);
            group1.removeNodeAt(0);

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

        test('add node at the start', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            group1.ensureNode(node1);
            group1.ensureNode(node2);

            expect(parent.childNodes[0]).toEqual(node2);
            expect(parent.childNodes[1]).toEqual(node1);
        });

        test('add node at the end', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            group1.ensureNode(node1);
            group1.ensureNode(node2, -1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node2);
        });

        test('add nodes in a group', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group1.ensureNode(node2, -1);
            group1.ensureNode(node3, -1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node2);
            expect(parent.childNodes[2]).toEqual(node3);
        });

        test('move node using add remove - 3rd to 2nd', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group1.ensureNode(node2, -1);
            group1.ensureNode(node3, -1);

            group1.ensureNode(node3, 1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node3);
            expect(parent.childNodes[2]).toEqual(node2);
        });

        test('move node using move - 3rd to 2nd', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group1.ensureNode(node2, -1);
            group1.ensureNode(node3, -1);

            group1.moveNode(2, 1);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node3);
            expect(parent.childNodes[2]).toEqual(node2);
        });

        test('move node using move - 2rd to 4nd', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            let node4 = makeNode(document, 'text4');
            let node5 = makeNode(document, 'text5');
            group1.ensureNode(node1);
            group1.ensureNode(node2, -1);
            group1.ensureNode(node3, -1);
            group1.ensureNode(node4, -1);
            group1.ensureNode(node5, -1);

            group1.moveNode(1, 3);

            expect(parent.childNodes[0]).toEqual(node1);
            expect(parent.childNodes[1]).toEqual(node3);
            expect(parent.childNodes[2]).toEqual(node4);
            expect(parent.childNodes[3]).toEqual(node2);
            expect(parent.childNodes[4]).toEqual(node5);
        });

        test('move node - remove 2nd, then re-add it as first', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let node1 = makeNode(document, 'text1');
            let node2 = makeNode(document, 'text2');
            let node3 = makeNode(document, 'text3');
            group1.ensureNode(node1);
            group1.ensureNode(node2, -1);
            group1.ensureNode(node3, -1);

            group1.removeNode(node2);
            group1.ensureNode(node2);

            expect(parent.childNodes[0]).toEqual(node2);
            expect(parent.childNodes[1]).toEqual(node1);
            expect(parent.childNodes[2]).toEqual(node3);
        });
    });

    describe('Kindergarten multiple collection groups', () => {
        test('two collection groups', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node11 = makeNode(document, 'text11');
            let node12 = makeNode(document, 'text12');
            let node13 = makeNode(document, 'text13');
            let node21 = makeNode(document, 'text21');
            let node22 = makeNode(document, 'text22');
            let node23 = makeNode(document, 'text23');
            group1.ensureNode(node11);
            group2.ensureNode(node21);
            group1.ensureNode(node12, -1);
            group2.ensureNode(node22, -1);
            group1.ensureNode(node13, -1);
            group2.ensureNode(node23, -1);

            expect(parent.childNodes[0]).toEqual(node11);
            expect(parent.childNodes[1]).toEqual(node12);
            expect(parent.childNodes[2]).toEqual(node13);
            expect(parent.childNodes[3]).toEqual(node21);
            expect(parent.childNodes[4]).toEqual(node22);
            expect(parent.childNodes[5]).toEqual(node23);
        });

        test('two collection groups, in different order', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node11 = makeNode(document, 'text11');
            let node12 = makeNode(document, 'text12');
            let node13 = makeNode(document, 'text13');
            let node21 = makeNode(document, 'text21');
            let node22 = makeNode(document, 'text22');
            let node23 = makeNode(document, 'text23');
            group2.ensureNode(node21);
            group2.ensureNode(node22, -1);
            group1.ensureNode(node11);
            group1.ensureNode(node12, -1);
            group2.ensureNode(node23, -1);
            group1.ensureNode(node13, -1);

            expect(parent.childNodes[0]).toEqual(node11);
            expect(parent.childNodes[1]).toEqual(node12);
            expect(parent.childNodes[2]).toEqual(node13);
            expect(parent.childNodes[3]).toEqual(node21);
            expect(parent.childNodes[4]).toEqual(node22);
            expect(parent.childNodes[5]).toEqual(node23);
        });

        test('two collection groups, with group mutations', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node11 = makeNode(document, 'text11');
            let node12 = makeNode(document, 'text12');
            let node13 = makeNode(document, 'text13');
            let node21 = makeNode(document, 'text21');
            let node22 = makeNode(document, 'text22');
            let node23 = makeNode(document, 'text23');
            group1.ensureNode(node11);
            group2.ensureNode(node21);
            group1.ensureNode(node12, -1);
            group2.ensureNode(node22, -1);
            group1.ensureNode(node13, -1);
            group2.ensureNode(node23, -1);

            group1.removeNode(node12);

            expect(parent.childNodes[0]).toEqual(node11);
            expect(parent.childNodes[1]).toEqual(node13);
            expect(parent.childNodes[2]).toEqual(node21);
            expect(parent.childNodes[3]).toEqual(node22);
            expect(parent.childNodes[4]).toEqual(node23);

            group1.ensureNode(node12, 1);

            expect(parent.childNodes[0]).toEqual(node11);
            expect(parent.childNodes[1]).toEqual(node12);
            expect(parent.childNodes[2]).toEqual(node13);
            expect(parent.childNodes[3]).toEqual(node21);
            expect(parent.childNodes[4]).toEqual(node22);
            expect(parent.childNodes[5]).toEqual(node23);
        });

        test('two collection groups, with group mutations using removeAt', () => {
            let {document, parent} = makeParent();
            let kindergarden = new Kindergarten(parent);
            let group1 = kindergarden.newGroup();
            let group2 = kindergarden.newGroup();
            let node11 = makeNode(document, 'text11');
            let node12 = makeNode(document, 'text12');
            let node13 = makeNode(document, 'text13');
            let node21 = makeNode(document, 'text21');
            let node22 = makeNode(document, 'text22');
            let node23 = makeNode(document, 'text23');
            group1.ensureNode(node11);
            group2.ensureNode(node21);
            group1.ensureNode(node12, -1);
            group2.ensureNode(node22, -1);
            group1.ensureNode(node13, -1);
            group2.ensureNode(node23, -1);

            group2.removeNodeAt(1);
            group1.removeNodeAt(1);

            expect(parent.childNodes[0]).toEqual(node11);
            expect(parent.childNodes[1]).toEqual(node13);
            expect(parent.childNodes[2]).toEqual(node21);
            expect(parent.childNodes[3]).toEqual(node23);

        })

    })

});
