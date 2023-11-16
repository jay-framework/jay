import { setChannel, useMockCommunicationChannel } from '../util/mock-channel';
import { initializeWorker } from './secure/worker/worker-root';
import { render } from './secure/main/app.jay.html';
import { JayPortMessageType } from '../../lib/comm-channel/messages';
import { ADD, REPLACE } from 'jay-json-patch';

const initialData = { firstName: 'Joe', lastName: 'Smith' };
const updatedData = { firstName: 'John', lastName: 'Green' };

describe('basic secure rendering', () => {
    async function mkElement() {
        let channel = useMockCommunicationChannel(false);
        setChannel(channel);
        initializeWorker();
        let appElement = render(initialData);
        await channel.toBeClean();
        return { channel, appElement };
    }

    it('should render simple component, secure', async () => {
        let { appElement } = await mkElement();

        expect(appElement.dom.childNodes[0].textContent).toBe('hello Joe Smith');
    });

    it('should render simple component, with only 2 messages', async () => {
        let { channel } = await mkElement();

        expect(channel.messageLog.length).toBe(2);
        expect(channel.messageLog).toEqual(
            expect.arrayContaining([
                expect.arrayContaining([
                    expect.objectContaining({
                        type: JayPortMessageType.root,
                    }),
                    'invoked',
                ]),
                expect.arrayContaining([
                    expect.objectContaining({
                        type: JayPortMessageType.render,
                    }),
                    'invoked',
                ]),
            ]),
        );
    });

    it('should render and update simple component, secure', async () => {
        let { channel, appElement } = await mkElement();

        appElement.update(updatedData);
        await channel.toBeClean();

        expect(appElement.dom.childNodes[0].textContent).toBe('hello John Green');
    });

    it('should render and update simple component, with 4 messages', async () => {
        let { channel, appElement } = await mkElement();

        appElement.update(updatedData);
        await channel.toBeClean();

        expect(channel.messageLog.length).toBe(4);
        expect(channel.messageLog).toEqual(
            expect.arrayContaining([
                expect.arrayContaining([
                    expect.objectContaining({
                        type: JayPortMessageType.root,
                        patch: [{ op: ADD, path: [], value: initialData }],
                    }),
                    'invoked',
                ]),
                expect.arrayContaining([
                    expect.objectContaining({
                        type: JayPortMessageType.render,
                    }),
                    'invoked',
                ]),
                expect.arrayContaining([
                    expect.objectContaining({
                        type: JayPortMessageType.root,
                        patch: [{ op: REPLACE, path: [], value: updatedData }],
                    }),
                    'invoked',
                ]),
                expect.arrayContaining([
                    expect.objectContaining({
                        type: JayPortMessageType.render,
                    }),
                    'invoked',
                ]),
            ]),
        );
    });
});
