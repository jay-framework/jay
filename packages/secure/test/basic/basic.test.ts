import {describe, expect, it} from '@jest/globals'
import {useMockCommunicationChannel} from "../comm-channel/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {BasicProps} from "./secure/main/basic";
import {BasicViewState} from "./secure/main/basic.jay.html";
import {render} from "./secure/main/app.jay.html";
import {setChannel} from "../../lib/comm-channel";
import {eventually10ms} from "../util/eventually";

describe('basic secure rendering', () => {
    it('should render simple component, secure', async () => {
        let channel = useMockCommunicationChannel<BasicProps, BasicViewState>();
        setChannel(channel);
        initializeWorker();
        let appElement = render({firstName: 'Joe', lastName: 'Smith'});
        // wait till render
        await eventually10ms(() => {
            expect(appElement.dom.childNodes[0].textContent).toBe('hello Joe Smith')
        })
    })

    it('should render and update simple component, secure', async () => {
        let channel = useMockCommunicationChannel<BasicProps, BasicViewState>();
        setChannel(channel);
        initializeWorker();
        let appElement = render({firstName: 'Joe', lastName: 'Smith'});
        appElement.update({firstName: 'John', lastName: 'Green'})

        await eventually10ms(() =>
            expect(appElement.dom.childNodes[0].textContent).toBe('hello John Green')
        )
    })
})