import {describe, expect, it} from '@jest/globals'
import {setChannel, useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {render} from "./secure/main/app.jay.html";
import {dispatchEvent} from "../util/dispatch-event";
import {eventually10ms} from "../util/eventually";

describe('events synthetic tests', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel();
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        let result = appElement.dom.querySelector('[data-id="result"]') as HTMLDivElement;
        let button = appElement.dom.querySelector('[data-id="button"]') as HTMLButtonElement;
        let buttonExec$ = appElement.dom.querySelector('[data-id="button-exec$"]') as HTMLButtonElement;
        let input = appElement.dom.querySelector('[data-id="input"]') as HTMLInputElement;

        let getDynamicButtonById = (id) => appElement.dom.querySelector(`[data-id="${id}-itemButton"]`) as HTMLButtonElement;
        let getDynamicInputById = (id) => appElement.dom.querySelector(`[data-id="${id}-itemInput"]`) as HTMLButtonElement;

        await channel.toBeClean();
        return {channel, appElement, result, button, input, buttonExec$, getDynamicButtonById, getDynamicInputById}
    }

    it('should render the component with default result', async () => {
        let {result} = await mkElement();
        expect(result.textContent).toBe('default result')
    })

    it('should react to button click', async () => {
        let {channel, result, button} = await mkElement();

        button.click()
        await channel.toBeClean()

        expect(result.textContent).toBe('static button was clicked')
    })

    it('should run $exec on button click and return a value', async () => {
        let {channel, result, buttonExec$} = await mkElement();

        buttonExec$.click()
        eventually10ms(() => {
            expect(result.textContent).toBe('button exec native was clicked')
        })
    })

    it('should react to static input value change', async () => {
        let {channel, result, input} = await mkElement();

        input.value = 'a new value entered via input'
        dispatchEvent(input, 'input');
        await channel.toBeClean()

        expect(result.textContent).toBe('a new value entered via input')
    })

    it('should react to dynamic buttons (under forEach) click', async () => {
        let {channel, result, button, getDynamicButtonById} = await mkElement();

        getDynamicButtonById('a').click()
        await channel.toBeClean()

        expect(result.textContent).toBe('dynamic button alpha was clicked at coordinate [a,itemButton]')
    })

    it('should react to dynamic input value change', async () => {
        let {channel, result, getDynamicInputById} = await mkElement();

        let input = getDynamicInputById('c')
        input.value = 'a new value entered via input c'
        dispatchEvent(input, 'input');
        await channel.toBeClean()

        expect(result.textContent).toBe('dynamic input gamma updated with value \'a new value entered via input c\' at coordinate [c,itemInput]')
    })
})