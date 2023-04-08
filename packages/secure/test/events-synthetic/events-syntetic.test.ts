import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../comm-channel/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {CompProps} from "./secure/main/comp";
import {CompViewState} from "./secure/main/comp.jay.html";
import {render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";
import {eventually10ms} from "../util/eventually";

describe('events synthetic tests', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel<CompProps, CompViewState>();
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        let result = appElement.dom.querySelector('[data-id="result"]') as HTMLDivElement;
        let button = appElement.dom.querySelector('[data-id="button"]') as HTMLButtonElement;
        let input = appElement.dom.querySelector('[data-id="input"]') as HTMLInputElement;

        let getDynamicButtonById = (id) => appElement.dom.querySelector(`[data-id="${id}-itemButton"]`) as HTMLButtonElement;

        await channel.toBeClean();
        return {channel, appElement, result, button, input, getDynamicButtonById}
    }

    it('should render the component with default result', async () => {
        let {result} = await mkElement();
        await eventually10ms(async () => {
            expect(result.textContent).toBe('default result')
        })
    })

    it('should react to button click', async () => {
        let {channel, result, button} = await mkElement();

        button.click()
        await channel.toBeClean()

        await eventually10ms(async () => {
            expect(result.textContent).toBe('static button was clicked')
        })
    })

    it('should react to static input value change', async () => {
        let {channel, result, input} = await mkElement();

        input.value = 'a new value entered via input'
        const event = new Event('input', {
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(event);
        await channel.toBeClean()

        await eventually10ms(async () => {
            expect(result.textContent).toBe('a new value entered via input')
        })
    })

    it('should react to dynamic buttons (under forEach) click', async () => {
        let {channel, result, button, getDynamicButtonById} = await mkElement();

        getDynamicButtonById('a').click()
        await channel.toBeClean()

        await eventually10ms(async () => {
            expect(result.textContent).toBe('dynamic button alpha was clicked')
        })
    })
})