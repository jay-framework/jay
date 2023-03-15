import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../comm-channel/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CounterProps} from "./secure/main/counter";
import {CounterViewState} from "./secure/main/counter.jay.html";
import {render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";
import {eventually10ms} from "../util/eventually";

describe('counter secure rendering - checking events', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel<CounterProps, CounterViewState>();
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        let title = appElement.dom.querySelector('[data-id="title"]') as HTMLDivElement;
        let add = appElement.dom.querySelector('[data-id="add"]') as HTMLButtonElement;
        let sub = appElement.dom.querySelector('[data-id="sub"]') as HTMLButtonElement;
        let count = appElement.dom.querySelector('[data-id="count"]')  as HTMLSpanElement;
        await channel.toBeClean();
        return {channel, title, add, sub, count};
    }

    it('should render a counter component, secure', async () => {
        let {title, count} = await mkElement()
        expect(title.textContent).toBe('first counter')
        expect(count.textContent).toBe('12')
    })

    it('should handle click event in secure counter', async () => {
        let {channel, title, add, sub, count} = await mkElement()

        add.click()
        await channel.toBeClean()

        expect(title.textContent).toBe('first counter')
        expect(count.textContent).toBe('13')
    })

})