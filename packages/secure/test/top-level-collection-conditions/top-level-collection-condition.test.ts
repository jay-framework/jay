import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CounterProps} from "./secure/main/counter";
import {CounterViewState} from "./secure/main/counter.jay.html";
import {AppViewState, render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";

const condCounter = 'cond'
const collCounterId_a = 'a'
const collCounterId_b = 'b'
const initialCountById = (id: string) => viewState.counters
    .find(_ => _.id === id)
    .initialCount;
const condCounterTitle = 'conditional counter'
const collCounterTitle = (id: string) => `collection counter ${id}`
const viewState: AppViewState = {cond: true, initialCount: 12, counters: [
        {id: collCounterId_a, initialCount: 13},
        {id: collCounterId_b, initialCount: 14},
    ]}

describe('top level collections and conditions', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel<CounterProps, CounterViewState>();
        setChannel(channel);
        initializeWorker();
        let appElement = render(viewState);
        let title = (id) => appElement.dom.querySelector(`[data-id="${id}-title"]`) as HTMLDivElement;
        let add = (id) => appElement.dom.querySelector(`[data-id="${id}-add"]`) as HTMLButtonElement;
        let sub = (id) => appElement.dom.querySelector(`[data-id="${id}-sub"]`) as HTMLButtonElement;
        let count = (id) => appElement.dom.querySelector(`[data-id="${id}-count"]`)  as HTMLSpanElement;
        await channel.toBeClean();
        return {channel, appElement, add, title, sub, count};
    }

    it('should render 3 counter components', async () => {
        let {appElement, title, count} = await mkElement()

        console.log(appElement.dom.outerHTML)
        expect(title(condCounter).textContent).toBe(condCounterTitle)
        expect(count(condCounter).textContent).toBe(''+viewState.initialCount)
        expect(title(collCounterId_a).textContent).toBe(collCounterTitle(collCounterId_a))
        expect(count(collCounterId_a).textContent).toBe(''+initialCountById(collCounterId_a))
        expect(title(collCounterId_b).textContent).toBe(collCounterTitle(collCounterId_b))
        expect(count(collCounterId_b).textContent).toBe(''+initialCountById(collCounterId_b))
    })

    it('the counter components should work', async () => {
        let {appElement, channel, title, count, add, sub} = await mkElement()

        add(condCounter).click();
        await channel.toBeClean();
        add(condCounter).click();
        await channel.toBeClean();
        add(collCounterId_a).click();
        await channel.toBeClean();
        sub(collCounterId_b).click();
        await channel.toBeClean();
        sub(collCounterId_b).click();
        await channel.toBeClean();

        console.log(appElement.dom.outerHTML)
        expect(title(condCounter).textContent).toBe(condCounterTitle)
        expect(count(condCounter).textContent).toBe('' + (viewState.initialCount + 2))
        expect(title(collCounterId_a).textContent).toBe(collCounterTitle(collCounterId_a))
        expect(count(collCounterId_a).textContent).toBe('' + (initialCountById(collCounterId_a) + 1))
        expect(title(collCounterId_b).textContent).toBe(collCounterTitle(collCounterId_b))
        expect(count(collCounterId_b).textContent).toBe('' + (initialCountById(collCounterId_b) - 2))
    })

    // it('should handle click event in secure counter', async () => {
    //     let {channel, title, add, sub, count} = await mkElement()
    //
    //     add.click()
    //     await channel.toBeClean()
    //
    //     expect(title.textContent).toBe('first counter')
    //     expect(count.textContent).toBe('13')
    // })
    //
    // it('should handle multiple click events', async () => {
    //     let {channel, title, add, sub, count} = await mkElement()
    //
    //     add.click()
    //     await channel.toBeClean()
    //     add.click()
    //     await channel.toBeClean()
    //     add.click()
    //     await channel.toBeClean()
    //     sub.click()
    //     await channel.toBeClean()
    //
    //     expect(title.textContent).toBe('first counter')
    //     expect(count.textContent).toBe('14')
    // })

})