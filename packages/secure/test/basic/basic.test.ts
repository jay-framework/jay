import {describe, expect, it} from '@jest/globals'
import {useMochCommunicationChannel} from "../comm-channel/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {BasicProps} from "./secure/main/basic";
import {BasicViewState} from "./secure/main/basic.jay.html";
import {render} from "./secure/main/app.jay.html";
import {setPort} from "../../lib/comm-channel";

function eventually(assertion: () => void, attemptsLimit: number, timeout: number) {
    let lastError;
    const tryAssertion = () => {
        try {
            assertion()
            return true;
        }
        catch (e) {
            lastError = e;
            return false;
        }
    }

    if (tryAssertion())
        return;

    let failures = 1;
    let interval = setInterval(() => {
        if (tryAssertion()) {
            clearInterval(interval)
            return;
        }
        failures += 1
        if (failures > attemptsLimit) {
            clearInterval(interval)
            throw lastError;
        }
    }, timeout)
}

const eventually10ms = (assertion: () => void) => eventually(assertion, 5, 2)

describe('basic secure rendering', () => {
    it('should render simple component, secure', () => {
        let [mainPort, workerPort] = useMochCommunicationChannel<BasicProps, BasicViewState>();
        setPort(workerPort);
        initializeWorker();
        setPort(mainPort);
        let appElement = render({firstName: 'Joe', lastName: 'Smith'});
        // wait till render
        eventually10ms(() =>
            expect(appElement.dom.childNodes[0].textContent).toBe('hello Joe smith')
        )
    })

    it('should render and update simple component, secure', () => {
        let [mainPort, workerPort] = useMochCommunicationChannel<BasicProps, BasicViewState>();
        setPort(workerPort);
        initializeWorker();
        setPort(mainPort);
        let appElement = render({firstName: 'Joe', lastName: 'Smith'});
        appElement.update({firstName: 'John', lastName: 'Green'})

        eventually10ms(() =>
            expect(appElement.dom.childNodes[0].textContent).toBe('hello John Green')
        )
    })
})