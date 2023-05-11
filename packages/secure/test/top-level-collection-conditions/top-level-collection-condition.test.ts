import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CounterProps} from "./secure/main/counter";
import {CounterViewState} from "./secure/main/counter.jay.html";
import {AppViewState, render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";

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
        // let title = appElement.dom.querySelector('[data-id="title"]') as HTMLDivElement;
        // let add = appElement.dom.querySelector('[data-id="add"]') as HTMLButtonElement;
        // let sub = appElement.dom.querySelector('[data-id="sub"]') as HTMLButtonElement;
        // let count = appElement.dom.querySelector('[data-id="count"]')  as HTMLSpanElement;
        await channel.toBeClean();
        return {channel, appElement};
    }

    it('should render a counter component, secure', async () => {
        let {appElement} = await mkElement()

        console.log(appElement.dom.outerHTML)
        // expect(title.textContent).toBe('first counter')
        // expect(count.textContent).toBe('12')
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