import {describe, expect, it} from '@jest/globals'
import {setChannel, useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {Node} from "./secure/main/tree-node";
import {TreeNodeViewState} from "./secure/main/tree-node.jay.html";
import {render} from "./secure/main/main-root";

const noChildrenNoArrow = "";
const closedArrow = "►";
const openArrow = "▼";
const Tree1 = {id: 'a', name: 'root', children: []};

const Tree2_B = {id: 'b', name: 'b node', children: []};
const Tree2_C = {id: 'c', name: 'c node', children: []};
const Tree2_D = {id: 'd', name: 'd node', children: []};
const Tree2_1 = {id: 'r', name: 'root', children: [Tree2_B]}
const Tree2_2 = {id: 'r', name: 'root', children: [Tree2_B, Tree2_C, Tree2_D]}

const Tree3_A_A = {id: 'aa', name: 'aa node', children: []};
const Tree3_A_B = {id: 'ab', name: 'ab node', children: []};
const Tree3_A = {id: 'a', name: 'a node', children: [Tree3_A_A, Tree3_A_B]};
const Tree3_A_2 = {id: 'a', name: 'a node', children: [Tree3_A_A]};
const Tree3_B_A = {id: 'ba', name: 'ba node', children: []};
const Tree3_B = {id: 'b', name: 'b node', children: [Tree3_B_A]};
const Tree3_C_A = {id: 'ca', name: 'ca node', children: []};
const Tree3_C_B = {id: 'cb', name: 'cb node', children: []};
const Tree3_C_C = {id: 'cc', name: 'cc node', children: []};
const Tree3_C = {id: 'c', name: 'c node', children: [Tree3_C_A, Tree3_C_B, Tree3_C_C]};
const Tree3_D_A = {id: 'da', name: 'da node', children: []};
const Tree3_D = {id: 'd', name: 'd node', children: [Tree3_D_A]};
const Tree3_E_A = {id: 'ea', name: 'ea node', children: []};
const Tree3_E = {id: 'e', name: 'e node', children: [Tree3_E_A]};
const Tree3_1 = {id: 'r', name: 'root', children: [Tree3_A, Tree3_B, Tree3_C, Tree3_D]}
const Tree3_2 = {id: 'r', name: 'root', children: [Tree3_A_2, Tree3_B, Tree3_E, Tree3_D]}

const VERBOSE = false;

describe('events synthetic tests', () => {

    async function mkElement(viewState: Node) {
        let channel = useMockCommunicationChannel<Node, TreeNodeViewState>(VERBOSE);
        setChannel(channel);
        initializeWorker();
        let appElement = render(viewState);
        let getHeadById = (node: Node) => appElement.dom.querySelector(`[data-ref="head=${node.id}"]`) as HTMLDivElement;
        let getHeadArrowById = (id) => appElement.dom.querySelector(`[data-ref="head=${id}"] .tree-arrow`) as HTMLSpanElement;
        let getHeadNameById = (id) => appElement.dom.querySelector(`[data-ref="head=${id}"] .name`) as HTMLSpanElement;
        let getListById = (id) => appElement.dom.querySelector(`[data-ref="list=${id}"]`) as HTMLUListElement

        let expectTreeNode = (node: Node, arrow: string, hasChildren: boolean) => {
            expect(getHeadArrowById(node.id)?.innerHTML).toBe(arrow)
            expect(getHeadNameById(node.id)?.innerHTML).toBe(node.name)
            if (hasChildren)
                expect(getListById(node.id)).toBeDefined()
            else
                expect(getListById(node.id)).toBeNull()
        }

        let expectNoTreeNode = (node: Node) => {
            expect(getHeadById(node)).toBeNull()
        }

        await channel.toBeClean();
        return {channel, getHeadById, appElement, expectTreeNode, expectNoTreeNode}
    }

    it('should render one level tree', async () => {
        let {expectTreeNode} = await mkElement(Tree1);

        expectTreeNode(Tree1, noChildrenNoArrow, false);
    })

    describe('two level tree', () => {
        it('render closed tree by default', async () => {
            let {expectTreeNode, appElement} = await mkElement(Tree2_1);

            VERBOSE && console.log(appElement.dom.outerHTML)

            expectTreeNode(Tree2_1, closedArrow, false);
        })

        it('should expand the child on click', async () => {
            let {expectTreeNode, channel, getHeadById, appElement} = await mkElement(Tree2_1);

            VERBOSE && console.log(appElement.dom.outerHTML)
            getHeadById(Tree2_1).click();
            await channel.toBeClean()

            VERBOSE && console.log(appElement.dom.outerHTML)
            expectTreeNode(Tree2_1, openArrow, true);
            expectTreeNode(Tree2_B, noChildrenNoArrow, false);
        })

        it('render closed tree with 3 children', async () => {
            let {expectTreeNode, appElement} = await mkElement(Tree2_2);

            VERBOSE && console.log(appElement.dom.outerHTML)

            expectTreeNode(Tree2_1, closedArrow, false);
        })

        it('update to open tree with 3 children', async () => {
            let {expectTreeNode, channel, getHeadById, appElement} = await mkElement(Tree2_2);

            VERBOSE && console.log(appElement.dom.outerHTML)
            getHeadById(Tree2_1).click();
            await channel.toBeClean()
            VERBOSE && console.log(appElement.dom.outerHTML)

            expectTreeNode(Tree2_1, openArrow, true);
            expectTreeNode(Tree2_B, noChildrenNoArrow, false);
            expectTreeNode(Tree2_C, noChildrenNoArrow, false);
            expectTreeNode(Tree2_D, noChildrenNoArrow, false);
        })

        it('update a single child tree to a 3 child tree', async () => {
            let {expectTreeNode, getHeadById, channel, appElement} = await mkElement(Tree2_1);
            getHeadById(Tree2_1).click();
            await channel.toBeClean()

            VERBOSE && console.log(appElement.dom.outerHTML)
            appElement.update(Tree2_2)
            await channel.toBeClean()

            VERBOSE && console.log(appElement.dom.outerHTML)
            expectTreeNode(Tree2_1, openArrow, true);
            expectTreeNode(Tree2_B, noChildrenNoArrow, false);
            expectTreeNode(Tree2_C, noChildrenNoArrow, false);
            expectTreeNode(Tree2_D, noChildrenNoArrow, false);
        })
    })

    describe('tree level tree', () => {
        it('render closed tree by default', async () => {
            let {expectTreeNode, appElement} = await mkElement(Tree3_1);

            VERBOSE && console.log(appElement.dom.outerHTML)

            expectTreeNode(Tree3_1, closedArrow, false);
        })

        it('expand the whole tree', async () => {
            let {channel, expectTreeNode, appElement, getHeadById} = await mkElement(Tree3_1);

            getHeadById(Tree3_1).click()
            await channel.toBeClean()
            getHeadById(Tree3_A).click()
            await channel.toBeClean()
            getHeadById(Tree3_B).click()
            await channel.toBeClean()
            getHeadById(Tree3_C).click()
            await channel.toBeClean()
            getHeadById(Tree3_D).click()
            await channel.toBeClean()
            VERBOSE && console.log(appElement.dom.outerHTML)

            expectTreeNode(Tree3_1, openArrow, true);
            expectTreeNode(Tree3_A, openArrow, true);
            expectTreeNode(Tree3_A_A, noChildrenNoArrow, false);
            expectTreeNode(Tree3_A_B, noChildrenNoArrow, false);
            expectTreeNode(Tree3_B, openArrow, true);
            expectTreeNode(Tree3_B_A, noChildrenNoArrow, false);
            expectTreeNode(Tree3_C, openArrow, true);
            expectTreeNode(Tree3_C_A, noChildrenNoArrow, false);
            expectTreeNode(Tree3_C_B, noChildrenNoArrow, false);
            expectTreeNode(Tree3_C_C, noChildrenNoArrow, false);
            expectTreeNode(Tree3_D, openArrow, true);
            expectTreeNode(Tree3_D_A, noChildrenNoArrow, false);
        })

        it('expand the whole tree and update tree', async () => {
            let {channel, expectTreeNode, expectNoTreeNode, appElement, getHeadById} = await mkElement(Tree3_1);

            getHeadById(Tree3_1).click()
            await channel.toBeClean()
            getHeadById(Tree3_A).click()
            await channel.toBeClean()
            getHeadById(Tree3_B).click()
            await channel.toBeClean()
            getHeadById(Tree3_C).click()
            await channel.toBeClean()
            getHeadById(Tree3_D).click()
            await channel.toBeClean()
            VERBOSE && console.log(appElement.dom.outerHTML)

            appElement.update(Tree3_2)
            await channel.toBeClean()
            VERBOSE && console.log(appElement.dom.outerHTML)

            expectTreeNode(Tree3_1, openArrow, true);
            expectTreeNode(Tree3_A, openArrow, true);
            expectTreeNode(Tree3_A_A, noChildrenNoArrow, false);
            expectNoTreeNode(Tree3_A_B);
            expectTreeNode(Tree3_B, openArrow, true);
            expectTreeNode(Tree3_B_A, noChildrenNoArrow, false);
            expectNoTreeNode(Tree3_C);
            expectNoTreeNode(Tree3_C_A);
            expectNoTreeNode(Tree3_C_B);
            expectNoTreeNode(Tree3_C_C);
            expectTreeNode(Tree3_D, openArrow, true);
            expectTreeNode(Tree3_D_A, noChildrenNoArrow, false);
            expectTreeNode(Tree3_E, closedArrow, false);
        })
    })

})