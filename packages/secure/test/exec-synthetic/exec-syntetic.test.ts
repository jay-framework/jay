import {describe, expect, it} from '@jest/globals'
import {setChannel, useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {render} from "./secure/main/app.jay.html";
import {eventually10ms} from "../util/eventually";

describe('exec synthetic tests', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel();
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        let result = appElement.dom.querySelector('[data-id="result"]') as HTMLDivElement;
        let buttonExec$Global = appElement.dom.querySelector('[data-id="button-exec-global"]') as HTMLButtonElement;
        let buttonExec$Element = appElement.dom.querySelector('[data-id="button-exec-element"]') as HTMLButtonElement;

        let getItemButtonExec$ById = (id) => appElement.dom.querySelector(`[data-id="item-${id}-button-exec-element"]`) as HTMLButtonElement;

        await channel.toBeClean();
        return {channel, appElement, result, buttonExec$Global, buttonExec$Element, getDynamicButtonById: getItemButtonExec$ById}
    }

    it('should run $exec on a static element and return value', async () => {
        let {result, buttonExec$Element} = await mkElement();

        buttonExec$Element.click()
        await eventually10ms(() => {
            expect(result.textContent).toBe('button with text button exec element was clicked')
        })
    })

    it.skip('should run global $exec return value', async () => {
        let {result, buttonExec$Global} = await mkElement();

        buttonExec$Global.click()
        await eventually10ms(() => {
            expect(result.textContent).toBe('button with text button exec element was clicked')
        })
    })

    it.skip('should run $exec on a dynamic element and return value', async () => {
        let {result, getDynamicButtonById} = await mkElement();

        getDynamicButtonById('b').click()
        await eventually10ms(() => {
            expect(result.textContent).toBe('button with text button exec element was clicked')
        })
    })
})