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

        await channel.toBeClean();
        return {appElement, result, button, input}
    }

    it('should render the component with default result', async () => {
        // wait till render
        let {result} = await mkElement();
        await eventually10ms(async () => {
            expect(result.textContent).toBe('default result')
        })
    })
})