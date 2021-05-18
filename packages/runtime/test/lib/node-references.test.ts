import {KindergardenGroupListener, Kindergarten} from '../../lib/kindergarden';
import {describe, expect, it, beforeEach} from '@jest/globals'
import {makeNode, makeParent} from "./test-utils";
import {KindergartenGroupReference, SingleReference} from "../../lib/node-reference";

describe('NodeReferences', () => {
    describe("SingleReference", () => {

        let node1;
        let singleReference;
        beforeEach(() => {
            let {document, parent} = makeParent();
            node1 = makeNode(document, 'text1');
            parent.appendChild(node1);

            singleReference = new SingleReference(node1);

        })

        it("should register event handler", () => {
            const mockCallback = jest.fn(_ => undefined);
            singleReference.addEventListener('click', mockCallback);

            node1.click();

            expect(mockCallback.mock.calls.length).toBe(1);
        })

        it("should remove event handler", () => {
            const mockCallback = jest.fn(_ => undefined);
            singleReference.addEventListener('click', mockCallback);
            node1.click();

            singleReference.removeEventListener('click', mockCallback);
            node1.click();
            expect(mockCallback.mock.calls.length).toBe(1);
        })

        it("should run forEach on the node", () => {
            singleReference.forEach(node => node.textContent = 'changed text');
            expect(node1.textContent).toBe('changed text')
        })
    });

    describe("KindergartenGroupReference", () => {
        let document, parent;
        let kindergarden, group1, groupReference;
        let node1, node2, node3;
        beforeEach(() => {
            ({document, parent} = makeParent());
            kindergarden = new Kindergarten(parent);
            group1 = kindergarden.newGroup();
            node1 = makeNode(document, 'text1');
            node2 = makeNode(document, 'text2');
            node3 = makeNode(document, 'text3');

            groupReference = new KindergartenGroupReference(group1);
        })

        it("should register events on all nodes in the group", () => {
            group1.ensureNode(node1);
            group1.ensureNode(node2);
            group1.ensureNode(node3);
            const mockCallback = jest.fn(_ => undefined);
            groupReference.addEventListener('click', mockCallback);

            node1.click();
            node2.click();

            expect(mockCallback.mock.calls.length).toBe(2);
        })

        it("should register events on nodes added to the group after setting the event handler", () => {
            group1.ensureNode(node1);
            group1.ensureNode(node2);
            const mockCallback = jest.fn(_ => undefined);
            groupReference.addEventListener('click', mockCallback);

            group1.ensureNode(node3);
            node3.click();

            expect(mockCallback.mock.calls.length).toBe(1);
        })
    })
});
