import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CounterProps} from "./secure/main/counter";
import {CounterViewState} from "./secure/main/counter.jay.html";
import {AppViewState, render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";

const COUNTER_COND_COORDINATE = ['comp1']
const COUNTER_COND = 'cond'
const COUNTER_A_ID = 'a'
const COUNTER_A_COORDINATE = [COUNTER_A_ID, 'comp2']
const COUNTER_B_ID = 'b'
const COUNTER_C_ID = 'c'
const initialCountById = (viewState: AppViewState, id: string) => viewState.counters
    .find(_ => _.id === id)
    .initialCount;
const condCounterTitle = 'conditional counter'
const collCounterTitle = (id: string) => `collection counter ${id}`
const COUNTER_A = {id: COUNTER_A_ID, initialCount: 13};
const COUNTER_B = {id: COUNTER_B_ID, initialCount: 14};
const COUNTER_C = {id: COUNTER_C_ID, initialCount: 15};
const viewState: AppViewState = {cond: true, initialCount: 12, counters: [
        COUNTER_A,
        COUNTER_B,
    ]}

const viewState2: AppViewState = {cond: false, initialCount: 12, counters: [
        COUNTER_A,
        COUNTER_B,
    ]}
const viewState3: AppViewState = {cond: true, initialCount: 12, counters: [
        COUNTER_C,
        COUNTER_A
    ]}

const VERBOSE = true;

describe('top level collections and conditions', () => {

    async function mkElement(viewState: AppViewState) {
        let channel = useMockCommunicationChannel<CounterProps, CounterViewState>(VERBOSE);
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

        VERBOSE && console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND).textContent).toBe(condCounterTitle)
        expect(count(COUNTER_COND).textContent).toBe(''+viewState.initialCount)
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(viewState, COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(viewState, COUNTER_B_ID))
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

        VERBOSE && console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND).textContent).toBe(condCounterTitle)
        expect(count(COUNTER_COND).textContent).toBe('' + (viewState.initialCount + 2))
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe('' + (initialCountById(viewState, COUNTER_A_ID) + 1))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe('' + (initialCountById(viewState, COUNTER_B_ID) - 2))
    })

    it('should not render the cond counter if condition === false', async () => {
        let {appElement, title, count} = await mkElement(viewState2)

        VERBOSE && console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND)).toBeNull()
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(viewState2, COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(viewState2, COUNTER_B_ID))
    })

    it('should not render the cond counter if condition is updated to false', async () => {
        let {appElement, channel, title, count} = await mkElement(viewState)

        appElement.update(viewState2)
        await channel.toBeClean();

        VERBOSE && console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND)).toBeNull()
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(viewState2, COUNTER_A_ID))
        expect(title(COUNTER_B_ID).textContent).toBe(collCounterTitle(COUNTER_B_ID))
        expect(count(COUNTER_B_ID).textContent).toBe(''+initialCountById(viewState2, COUNTER_B_ID))
    })

    it('should update the collection counters', async () => {
        let {appElement, channel, title, count} = await mkElement(viewState)

        appElement.update(viewState3)
        await channel.toBeClean();

        VERBOSE && console.log(appElement.dom.outerHTML)
        expect(title(COUNTER_COND).textContent).toBe(condCounterTitle)
        expect(count(COUNTER_COND).textContent).toBe('' + (viewState.initialCount))
        expect(title(COUNTER_A_ID).textContent).toBe(collCounterTitle(COUNTER_A_ID))
        expect(count(COUNTER_A_ID).textContent).toBe(''+initialCountById(viewState3, COUNTER_A_ID))
        expect(title(COUNTER_C_ID).textContent).toBe(collCounterTitle(COUNTER_C_ID))
        expect(count(COUNTER_C_ID).textContent).toBe(''+initialCountById(viewState3, COUNTER_C_ID))
    })

    it('supports root component APIs for conditional component', async () => {
        let {appElement, channel, title, count} = await mkElement(viewState)

        expect(await appElement.refs.comp1.counterDescription()).toBe('conditional counter: 12')

    })

    it('supports root component APIs for collection component', async () => {
        let {appElement, channel, title, count} = await mkElement(viewState)

        expect(await appElement.refs.comp2.find(_ => _.id === COUNTER_A_ID).counterDescription())
            .toBe('collection counter a: 13')

    })

    it('supports root component events for conditional component', async () => {
        let {appElement, channel, add, title, count} = await mkElement(viewState)
        let fn = jest.fn();

        appElement.refs.comp1.onChange(fn);
        await channel.toBeClean();
        add(COUNTER_COND).click();
        await channel.toBeClean();

        expect(fn).toBeCalledTimes(1)
        expect(fn).toBeCalledWith({event: {value: viewState.initialCount+1}, viewState, coordinate: COUNTER_COND_COORDINATE})
    })

    it('supports root component events for collection component', async () => {
        let {appElement, channel, add, title, count} = await mkElement(viewState)
        let fn = jest.fn();

        // this does not batch messages!!!
        appElement.refs.comp2.onChange(fn);
        await channel.toBeClean();
        add(COUNTER_A_ID).click();
        await channel.toBeClean();

        expect(fn).toBeCalledTimes(1)
        expect(fn).toBeCalledWith({event: {value: COUNTER_A.initialCount+1}, viewState: COUNTER_A, coordinate: COUNTER_A_COORDINATE})
    })

})