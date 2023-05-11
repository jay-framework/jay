import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CounterProps} from "./secure/main/counter";
import {CounterViewState} from "./secure/main/counter.jay.html";
import {AppViewState, render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";

const cond = 'cond'
const viewState: AppViewState = {cond: true, initialCount: 12, counters: [
        {id: 'a', initialCount: 13},
        {id: 'b', initialCount: 14},
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
        expect(title(cond).textContent).toBe('conditional counter')
        expect(count(cond).textContent).toBe('12')
        expect(title(viewState.counters[0].id).textContent).toBe(`collection counter ${viewState.counters[0].id}`)
        expect(count(viewState.counters[0].id).textContent).toBe(''+viewState.counters[0].initialCount)
        expect(title(viewState.counters[1].id).textContent).toBe(`collection counter ${viewState.counters[1].id}`)
        expect(count(viewState.counters[1].id).textContent).toBe(''+viewState.counters[1].initialCount)
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