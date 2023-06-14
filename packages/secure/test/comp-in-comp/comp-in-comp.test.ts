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
        let eventToParentButton = appElement.dom.querySelector('#event-to-parent-button') as HTMLButtonElement
        let eventToParentToChildPropButton = appElement.dom.querySelector('#event-to-parent-to-child-prop-button') as HTMLButtonElement
        let eventToParentToChildAPIButton = appElement.dom.querySelector('#event-to-parent-to-child-api-button') as HTMLButtonElement
        let childTextFromProp = appElement.dom.querySelector('#child-text-from-prop')
        let childTextFromAPI = appElement.dom.querySelector('#child-text-from-api')
        let textFromChildEvent = appElement.dom.querySelector("#text-from-child-event")
        let viewStateFromChildEvent = appElement.dom.querySelector("#view-state-from-child-event")
        let coordinateFromChildEvent = appElement.dom.querySelector("#coordinate-from-child-event")
        let parentChangesChildPropButton = appElement.dom.querySelector("#parent-changes-child-prop-button") as HTMLButtonElement
        let parentCallsChildAPIButton = appElement.dom.querySelector("#parent-calls-child-api-button") as HTMLButtonElement

        await channel.toBeClean();
        return {channel, appElement, eventToParentButton, eventToParentToChildPropButton, eventToParentToChildAPIButton,
            childTextFromProp, childTextFromAPI, textFromChildEvent, viewStateFromChildEvent, coordinateFromChildEvent,
            parentChangesChildPropButton, parentCallsChildAPIButton};
    }

    it('should render the component in component structure', async () => {
        let {channel, appElement} = await mkElement();
        console.log(appElement.dom.outerHTML)
        expect("not to have an error").toBe('not to have an error')
    })

    it('should support parent updating property on child', async () => {
        let {channel, parentChangesChildPropButton, childTextFromProp} = await mkElement();

        parentChangesChildPropButton.click();
        await channel.toBeClean();

        let event = undefined;
        let viewState = {
            "textFromChildEvent":"-",
            "viewStateFromChildEvent":"-",
            "coordinateFromChildEvent":"-",
            "childText":"-"
        }
        let coordinate = ['parentChangesChildPropButton']
        expect(childTextFromProp.textContent)
            .toBe(`text from parent: event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(viewState)}`)
    })

    it('should support parent calling child API', async () => {
        let {channel, parentCallsChildAPIButton, childTextFromAPI} = await mkElement();

        parentCallsChildAPIButton.click();
        await channel.toBeClean();

        let event = undefined;
        let viewState = {
            "textFromChildEvent":"-",
            "viewStateFromChildEvent":"-",
            "coordinateFromChildEvent":"-",
            "childText":"-"
        }
        let coordinate = ['parentCallsChildApiButton']
        expect(childTextFromAPI.textContent)
            .toBe(`event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(viewState)}`)
    })

    it('should support child sending event to parent', async () => {
        let {channel, eventToParentButton, textFromChildEvent, viewStateFromChildEvent, coordinateFromChildEvent, appElement} = await mkElement();

        eventToParentButton.click();
        await channel.toBeClean();

        let event = {useCase: `event from child`, useCaseId: 0}
        console.log(appElement.dom.outerHTML)

        let viewState = {
            "textFromChildEvent":"-",
            "viewStateFromChildEvent":"-",
            "coordinateFromChildEvent":"-",
            "childText":"-"
        }
        let coordinate = ['child']
        expect(textFromChildEvent.textContent).toBe(event.useCase)
        expect(viewStateFromChildEvent.textContent).toBe(JSON.stringify(viewState))
        expect(coordinateFromChildEvent.textContent).toBe(JSON.stringify(coordinate))
    })

    it('should support child -> event -> parent -> api call -> child', async () => {
        let {channel, eventToParentToChildAPIButton, childTextFromAPI} = await mkElement();

        eventToParentToChildAPIButton.click();
        await channel.toBeClean();

        let event = undefined;
        let viewState = {}
        let coordinate = ['child']
        expect(childTextFromAPI.textContent)
            .toBe('parent calling child api')
    })

    it('should support child -> event -> parent -> prop change -> child', async () => {
        let {channel, eventToParentToChildPropButton, childTextFromProp} = await mkElement();

        eventToParentToChildPropButton.click();
        await channel.toBeClean();

        let event = undefined;
        let viewState = {}
        let coordinate = ['child']
        expect(childTextFromProp.textContent)
            .toBe('text from parent: update from parent')

    })
})