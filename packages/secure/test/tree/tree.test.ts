import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {Node} from "./secure/main/tree-node";
import {TreeNodeViewState} from "./secure/main/tree-node.jay.html";
import {render} from "./secure/main/main-root";
import {setChannel} from "../../lib/comm-channel";

const noChildrenNoArrow = "";
const closedArrow = "►";
const openArrow = "▼";
const singleNode = {id: 'a', name: 'root', children: []};
const B = {id: 'b', name: 'b node', children: []};
const C = {id: 'c', name: 'c node', children: []};
const D = {id: 'd', name: 'd node', children: []};
const oneLevelTreeOneChild = {id: 'r', name: 'root', children: [B]}

describe('events synthetic tests', () => {

    async function mkElement(viewState: Node) {
        let channel = useMockCommunicationChannel<Node, TreeNodeViewState>(true);
        setChannel(channel);
        initializeWorker();
        let appElement = render(viewState);
        let getHeadById = (id) => appElement.dom.querySelector(`[data-ref="head=${id}"]`) as HTMLDivElement;
        let getHeadArrowById = (id) => appElement.dom.querySelector(`[data-ref="head=${id}"] .tree-arrow`) as HTMLSpanElement;
        let getHeadNameById = (id) => appElement.dom.querySelector(`[data-ref="head=${id}"] .name`) as HTMLSpanElement;
        let getListById = (id) => appElement.dom.querySelector(`[data-ref="list=${id}"]`) as HTMLUListElement

        await channel.toBeClean();
        return {channel, getHeadById, getListById, getHeadArrowById, getHeadNameById, appElement}
    }

    it('should render one level tree', async () => {
        let {getListById, getHeadArrowById, getHeadNameById} = await mkElement(singleNode);

        expect(getHeadArrowById(singleNode.id)?.innerHTML).toBe(noChildrenNoArrow)
        expect(getHeadNameById(singleNode.id)?.innerHTML).toBe(singleNode.name)
        expect(getListById(singleNode.id)).toBeNull()
    })

    describe('two level tree', () => {
        it('render closed tree by default', async () => {
            let {getListById, getHeadArrowById, getHeadNameById, appElement} = await mkElement(oneLevelTreeOneChild);

            console.log(appElement.dom.outerHTML)

            expect(getHeadArrowById(oneLevelTreeOneChild.id)?.innerHTML).toBe(closedArrow)
            expect(getHeadNameById(oneLevelTreeOneChild.id)?.innerHTML).toBe(oneLevelTreeOneChild.name)
            expect(getListById(oneLevelTreeOneChild.id)).toBeNull();
        })

        it('should expand the child on click', async () => {
            let {channel, getListById, getHeadArrowById, getHeadNameById, getHeadById, appElement} = await mkElement(oneLevelTreeOneChild);

            console.log(appElement.dom.outerHTML)
            getHeadById(oneLevelTreeOneChild.id).click();
            await channel.toBeClean()

            console.log(appElement.dom.outerHTML)
            expect(getHeadArrowById(oneLevelTreeOneChild.id)?.innerHTML).toBe(openArrow)
            expect(getHeadNameById(oneLevelTreeOneChild.id)?.innerHTML).toBe(oneLevelTreeOneChild.name)
            expect(getListById(oneLevelTreeOneChild.id)).toBeDefined();
            expect(getHeadArrowById(B.id)?.innerHTML).toBe(noChildrenNoArrow)
            expect(getHeadNameById(B.id)?.innerHTML).toBe(B.name)
            expect(getListById(B.id)).toBeNull();
        })
    })

    // it('should expand the node on header click', async () => {
    //     let {appElement, channel, getHeadById, getListById, getHeadArrowById, getHeadNameById} = await mkElement(singleNode);
    //
    //     getHeadById(singleNode.id).click();
    //     await channel.toBeClean();
    //
    //     expect(getHeadArrowById(singleNode.id)?.innerHTML).toBe(closedArrow)
    //     expect(getHeadNameById(singleNode.id)?.innerHTML).toBe(singleNode.name)
    //     expect(getListById(singleNode.id)).toBeNull()
    //     // expect(result.textContent).toBe('default result')
    // })

    // it('should react to button click', async () => {
    //     let {channel, result, button} = await mkElement();
    //
    //     button.click()
    //     await channel.toBeClean()
    //
    //     expect(result.textContent).toBe('static button was clicked')
    // })
    //
    // it('should react to static input value change', async () => {
    //     let {channel, result, input} = await mkElement();
    //
    //     input.value = 'a new value entered via input'
    //     dispatchEvent(input, 'input');
    //     await channel.toBeClean()
    //
    //     expect(result.textContent).toBe('a new value entered via input')
    // })
    //
    // it('should react to dynamic buttons (under forEach) click', async () => {
    //     let {channel, result, button, getDynamicButtonById} = await mkElement();
    //
    //     getDynamicButtonById('a').click()
    //     await channel.toBeClean()
    //
    //     expect(result.textContent).toBe('dynamic button alpha was clicked at coordinate [a,itemButton]')
    // })
    //
    // it('should react to dynamic input value change', async () => {
    //     let {channel, result, getDynamicInputById} = await mkElement();
    //
    //     let input = getDynamicInputById('c')
    //     input.value = 'a new value entered via input c'
    //     dispatchEvent(input, 'input');
    //     await channel.toBeClean()
    //
    //     expect(result.textContent).toBe('dynamic input gamma updated with value \'a new value entered via input c\' at coordinate [c,itemInput]')
    // })
})