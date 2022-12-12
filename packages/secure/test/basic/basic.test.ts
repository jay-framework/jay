import {describe, expect, it} from '@jest/globals'
import {useMochCommunicationChannel} from "../comm-channel/mock-channel";
import {initializeWorker} from "./secure/worker/worker-root";
import {BasicProps, initializeMain} from "./secure/main/main-root";

describe('basic secure rendering', () => {
    it('should render simple component, secure', () => {
        let [mainPort, workerPort] = useMochCommunicationChannel<BasicProps>();
        let workerApp = initializeWorker(workerPort);
        let mainApp = initializeMain(mainPort);
        mainApp.start({firstName: 'Joe', lastName: 'smith'})

        expect(mainApp.element.dom.childNodes[0].textContent).toBe('hello Joe smith');
    })

    it('should render and update simple component, secure', () => {
        let [mainPort, workerPort] = useMochCommunicationChannel<BasicProps>();
        let workerApp = initializeWorker(workerPort);
        let mainApp = initializeMain(mainPort);
        mainApp.start({firstName: 'Joe', lastName: 'smith'})
        mainApp.update({firstName: 'John', lastName: 'Green'})

        expect(mainApp.element.dom.childNodes[0].textContent).toBe('hello John Green');
    })
})