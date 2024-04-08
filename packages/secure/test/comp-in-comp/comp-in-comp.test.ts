import { setChannel, useMockCommunicationChannel } from '../../lib/test-utils';
import { initializeWorker } from './secure/worker/worker-root';
import { render } from './secure/main/app.jay-html';

const STATIC_ID = 'static';
const DYNAMIC_ID = 'A';
const VERBOSE = false;
describe('comp in comp - parent child communication', () => {
    async function mkElement() {
        let channel = useMockCommunicationChannel(VERBOSE);
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        let eventToParentButton = (id) =>
            appElement.dom.querySelector(`#event-to-parent-button-${id}`) as HTMLButtonElement;
        let eventToParentToChildPropButton = (id) =>
            appElement.dom.querySelector(
                `#event-to-parent-to-child-prop-button-${id}`,
            ) as HTMLButtonElement;
        let eventToParentToChildAPIButton = (id) =>
            appElement.dom.querySelector(
                `#event-to-parent-to-child-api-button-${id}`,
            ) as HTMLButtonElement;
        let childTextFromProp = (id) => appElement.dom.querySelector(`#child-text-from-prop-${id}`);
        let childTextFromAPI = (id) => appElement.dom.querySelector(`#child-text-from-api-${id}`);
        let textFromChildEvent = appElement.dom.querySelector('#text-from-child-event');
        let viewStateFromChildEvent = appElement.dom.querySelector('#view-state-from-child-event');
        let coordinateFromChildEvent = appElement.dom.querySelector('#coordinate-from-child-event');
        let parentChangesChildPropButton = appElement.dom.querySelector(
            '#parent-changes-child-prop-button',
        ) as HTMLButtonElement;
        let parentCallsChildAPIButton = appElement.dom.querySelector(
            '#parent-calls-child-api-button',
        ) as HTMLButtonElement;

        await channel.toBeClean();
        return {
            channel,
            appElement,
            eventToParentButton,
            eventToParentToChildPropButton,
            eventToParentToChildAPIButton,
            childTextFromProp,
            childTextFromAPI,
            textFromChildEvent,
            viewStateFromChildEvent,
            coordinateFromChildEvent,
            parentChangesChildPropButton,
            parentCallsChildAPIButton,
        };
    }

    it('should render the component in component structure', async () => {
        let { channel, appElement } = await mkElement();
        //        console.log(appElement.dom.outerHTML)
        expect('not to have an error').toBe('not to have an error');
    });

    describe('parent to static child communication', () => {
        it('should support parent updating property on child', async () => {
            let { channel, parentChangesChildPropButton, childTextFromProp } = await mkElement();

            parentChangesChildPropButton.click();
            await channel.toBeClean();

            let event = undefined;
            let viewState = {
                textFromChildEvent: '-',
                viewStateFromChildEvent: '-',
                coordinateFromChildEvent: '-',
                childText: '-',
                dynamicChildren: [{ id: 'A', childText: '-' }],
            };
            let coordinate = ['parentChangesChildPropButton'];
            expect(childTextFromProp(STATIC_ID).textContent).toBe(
                `text from parent: event from parent ${event} ${JSON.stringify(
                    coordinate,
                )} ${JSON.stringify(viewState)}`,
            );
        });

        it('should support parent calling child API', async () => {
            let { channel, parentCallsChildAPIButton, childTextFromAPI } = await mkElement();

            parentCallsChildAPIButton.click();
            await channel.toBeClean();

            let event = undefined;
            let viewState = {
                textFromChildEvent: '-',
                viewStateFromChildEvent: '-',
                coordinateFromChildEvent: '-',
                childText: '-',
                dynamicChildren: [{ id: 'A', childText: '-' }],
            };
            let coordinate = ['parentCallsChildApiButton'];
            expect(childTextFromAPI(STATIC_ID).textContent).toBe(
                `event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(
                    viewState,
                )}`,
            );
        });

        it('should support child sending event to parent', async () => {
            let {
                channel,
                eventToParentButton,
                textFromChildEvent,
                viewStateFromChildEvent,
                coordinateFromChildEvent,
                appElement,
            } = await mkElement();

            eventToParentButton(STATIC_ID).click();
            await channel.toBeClean();

            let event = { useCase: `event from child`, useCaseId: 0 };

            let viewState = {
                textFromChildEvent: '-',
                viewStateFromChildEvent: '-',
                coordinateFromChildEvent: '-',
                childText: '-',
                dynamicChildren: [{ id: 'A', childText: '-' }],
            };
            let coordinate = ['staticChild'];
            expect(textFromChildEvent.textContent).toBe(event.useCase);
            expect(viewStateFromChildEvent.textContent).toBe(JSON.stringify(viewState));
            expect(coordinateFromChildEvent.textContent).toBe(JSON.stringify(coordinate));
        });

        it('should support child -> event -> parent -> api call -> child', async () => {
            let { channel, eventToParentToChildAPIButton, childTextFromAPI } = await mkElement();

            eventToParentToChildAPIButton(STATIC_ID).click();
            await channel.toBeClean();

            expect(childTextFromAPI(STATIC_ID).textContent).toBe('parent calling child api');
        });

        it('should support child -> event -> parent -> prop change -> child', async () => {
            let { channel, eventToParentToChildPropButton, childTextFromProp } = await mkElement();

            eventToParentToChildPropButton(STATIC_ID).click();
            await channel.toBeClean();

            expect(childTextFromProp(STATIC_ID).textContent).toBe(
                'text from parent: update from parent',
            );
        });
    });

    describe('parent to dynamic (forEach) child communication', () => {
        it('should support parent updating property on child', async () => {
            let { channel, parentChangesChildPropButton, childTextFromProp, appElement } =
                await mkElement();

            parentChangesChildPropButton.click();
            await channel.toBeClean();
            VERBOSE && console.log(appElement.dom.outerHTML);
            let event = undefined;
            let viewState = {
                textFromChildEvent: '-',
                viewStateFromChildEvent: '-',
                coordinateFromChildEvent: '-',
                childText: '-',
                dynamicChildren: [{ id: 'A', childText: '-' }],
            };
            let coordinate = ['parentChangesChildPropButton'];
            expect(childTextFromProp(DYNAMIC_ID).textContent).toBe(
                `text from parent: event from parent ${event} ${JSON.stringify(
                    coordinate,
                )} ${JSON.stringify(viewState)}`,
            );
        });

        it('should support parent calling child API', async () => {
            let { channel, parentCallsChildAPIButton, childTextFromAPI } = await mkElement();

            parentCallsChildAPIButton.click();
            await channel.toBeClean();

            let event = undefined;
            let viewState = {
                textFromChildEvent: '-',
                viewStateFromChildEvent: '-',
                coordinateFromChildEvent: '-',
                childText: '-',
                dynamicChildren: [{ id: 'A', childText: '-' }],
            };
            let coordinate = ['parentCallsChildApiButton'];
            expect(childTextFromAPI(DYNAMIC_ID).textContent).toBe(
                `event from parent ${event} ${JSON.stringify(coordinate)} ${JSON.stringify(
                    viewState,
                )}`,
            );
        });

        it('should support child sending event to parent', async () => {
            let {
                channel,
                eventToParentButton,
                textFromChildEvent,
                viewStateFromChildEvent,
                coordinateFromChildEvent,
                appElement,
            } = await mkElement();

            eventToParentButton(DYNAMIC_ID).click();
            await channel.toBeClean();

            let event = { useCase: `event from child`, useCaseId: 0 };

            let viewState = { id: 'A', childText: '-' };
            let coordinate = ['A', 'dynamicChildren'];
            expect(textFromChildEvent.textContent).toBe(event.useCase);
            expect(viewStateFromChildEvent.textContent).toBe(JSON.stringify(viewState));
            expect(coordinateFromChildEvent.textContent).toBe(JSON.stringify(coordinate));
        });

        it('should support child -> event -> parent -> api call -> child', async () => {
            let { channel, eventToParentToChildAPIButton, childTextFromAPI } = await mkElement();

            eventToParentToChildAPIButton(DYNAMIC_ID).click();
            await channel.toBeClean();

            expect(childTextFromAPI(DYNAMIC_ID).textContent).toBe('parent calling child api');
        });

        it('should support child -> event -> parent -> prop change -> child', async () => {
            let { channel, eventToParentToChildPropButton, childTextFromProp } = await mkElement();

            eventToParentToChildPropButton(DYNAMIC_ID).click();
            await channel.toBeClean();

            expect(childTextFromProp(DYNAMIC_ID).textContent).toBe(
                'text from parent: update from parent',
            );
        });
    });
});
