import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CounterProps} from "./secure/main/counter";
import {CounterViewState} from "./secure/main/counter.jay.html";
import {AppViewState, render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";

const COUNTER_COND = 'cond'
const COUNTER_A_ID = 'a'
const COUNTER_B_ID = 'b'
const initialCountById = (id: string) => viewState.counters
    .find(_ => _.id === id)
    .initialCount;
const condCounterTitle = 'conditional counter'
const collCounterTitle = (id: string) => `collection counter ${id}`
const COUNTER_A = {id: COUNTER_A_ID, initialCount: 13};
const COUNTER_B = {id: COUNTER_B_ID, initialCount: 14};
const viewState: AppViewState = {cond: true, initialCount: 12, counters: [
        COUNTER_A,
        COUNTER_B,
    ]}

const viewState2: AppViewState = {cond: false, initialCount: 12, counters: [
        COUNTER_A,
        COUNTER_B,
    ]}
const viewState3: AppViewState = {cond: false, initialCount: 12, counters: []}

describe('top level collections and conditions', () => {

    async function mkElement(viewState: AppViewState) {
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
        let {appElement, title, count} = await mkElement(viewState)

        console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND).textContent).toBe(condCounterTitle)
        expect(count(COUNTER_COND).textContent).toBe(''+viewState.initialCount)
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(COUNTER_B_ID))
    })

    it('the counter components should work', async () => {
        let {appElement, channel, title, count, add, sub} = await mkElement(viewState)

        add(COUNTER_COND).click();
        await channel.toBeClean();
        add(COUNTER_COND).click();
        await channel.toBeClean();
        add(COUNTER_A_ID).click();
        await channel.toBeClean();
        sub(COUNTER_B_ID).click();
        await channel.toBeClean();
        sub(COUNTER_B_ID).click();
        await channel.toBeClean();

        console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND).textContent).toBe(condCounterTitle)
        expect(count(COUNTER_COND).textContent).toBe('' + (viewState.initialCount + 2))
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe('' + (initialCountById(COUNTER_A_ID) + 1))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe('' + (initialCountById(COUNTER_B_ID) - 2))
    })

    it('should not render the cond counter if condition === false', async () => {
        let {appElement, title, count} = await mkElement(viewState2)

        console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND)).toBeNull()
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(COUNTER_B_ID))
    })

    it('should not render the cond counter if condition is updated to false', async () => {
        let {appElement, channel, title, count} = await mkElement(viewState)

        appElement.update(viewState2)
        await channel.toBeClean();

        console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND)).toBeNull()
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(COUNTER_B_ID))
    })

    it('should update the collection counters', async () => {
        let {appElement, channel, title, count} = await mkElement(viewState)

        appElement.update(viewState3)
        await channel.toBeClean();

        console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND)).toBeNull()
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(COUNTER_B_ID))
    })

    it('supports root component APIs', () => {

    })

    it('supports root component events', () => {

    })

})