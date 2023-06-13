import {describe, expect, it} from '@jest/globals'
import {setChannel, useMockCommunicationChannel} from "../util/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {render} from "./secure/main/app.jay.html";

describe('comp in comp - parent child communication', () => {

    async function mkElement() {
        let channel = useMockCommunicationChannel(false);
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        await channel.toBeClean();
        return {channel, appElement};
    }

    it('should render simple component, secure', async () => {
        let {channel, appElement} = await mkElement();
        console.log(appElement.dom.outerHTML)
        expect(appElement.dom.childNodes[0].textContent).toBe('hello Joe Smith')
    })
})