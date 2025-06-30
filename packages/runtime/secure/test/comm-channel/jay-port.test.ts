import { JayPort, JayPortLogger } from '../../lib';
import { JayChannel, JPMMessage } from '../../lib';
import {
    addEventListenerMessage,
    eventInvocationMessage,
    renderMessage,
} from '../../lib/comm-channel/messages';
import { eventually10ms } from '../util/eventually';
import { REPLACE } from '@jay-framework/json-patch';

const MESSAGE_RENDER_1 = renderMessage([{ op: REPLACE, path: ['a'], value: { foo: 'bar' } }]);
const MESSAGE_RENDER_2 = renderMessage([{ op: REPLACE, path: ['a'], value: { foo: 'goo' } }]);
const MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD = addEventListenerMessage('add', 'click');
const MESSAGE_ADD_EVENT_LISTENER_CLICK_DEC = addEventListenerMessage('dec', 'click');
const MESSAGE_EVENT_CLICK_ADD = eventInvocationMessage('click', ['add']);
const MESSAGE_EVENT_CLICK_DEC = eventInvocationMessage('click', ['dec']);

describe('jay-port', () => {
    function mkPort() {
        let channel: TestJayChannel = new TestJayChannel();
        let logger: TestJayPortLogger = new TestJayPortLogger();
        let port = new JayPort(channel, logger);
        return { channel, logger, port };
    }

    describe('sending messages', () => {
        it('should generate compId and send it as a message', () => {
            let { port, logger, channel } = mkPort();

            let endpoint = port.getEndpoint(1, ['comp1']);
            port.flush();

            expect(channel.messagesFromPort).toContainEqual({
                messages: [],
                newCompIdMessages: [['1-comp1', 2]],
            });
        });

        it('should send a component message', () => {
            let { port, logger, channel } = mkPort();

            let endpoint = port.getEndpoint(1, ['comp1']);
            endpoint.post(MESSAGE_RENDER_1);
            port.flush();

            expect(channel.messagesFromPort).toContainEqual({
                messages: [[2, MESSAGE_RENDER_1]],
                newCompIdMessages: [['1-comp1', 2]],
            });
        });

        it('should send a component message using batch', () => {
            let { port, logger, channel } = mkPort();

            port.batch(() => {
                let endpoint = port.getEndpoint(1, ['comp1']);
                endpoint.post(MESSAGE_RENDER_1);
            });

            expect(channel.messagesFromPort).toContainEqual({
                messages: [[2, MESSAGE_RENDER_1]],
                newCompIdMessages: [['1-comp1', 2]],
            });
        });

        it('should send multiple components and multiple messages', () => {
            let { port, logger, channel } = mkPort();

            port.batch(() => {
                let endpoint1 = port.getEndpoint(1, ['comp1']);
                endpoint1.post(MESSAGE_RENDER_1);
                let endpoint2 = port.getEndpoint(1, ['comp2', 'a']);
                endpoint2.post(MESSAGE_RENDER_2);
                endpoint2.post(MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD);
            });

            expect(channel.messagesFromPort).toContainEqual({
                messages: [
                    [2, MESSAGE_RENDER_1],
                    [3, MESSAGE_RENDER_2],
                    [3, MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD],
                ],
                newCompIdMessages: [
                    ['1-comp1', 2],
                    ['1-comp2,a', 3],
                ],
            });
        });

        it('should auto batch and flush messages', async () => {
            let { port, logger, channel } = mkPort();

            let endpoint1 = port.getEndpoint(1, ['comp1']);
            endpoint1.post(MESSAGE_RENDER_1);
            let endpoint2 = port.getEndpoint(1, ['comp2', 'a']);
            endpoint2.post(MESSAGE_RENDER_2);
            endpoint2.post(MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD);

            await eventually10ms(() => {
                expect(channel.messagesFromPort).toContainEqual({
                    messages: [
                        [2, MESSAGE_RENDER_1],
                        [3, MESSAGE_RENDER_2],
                        [3, MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD],
                    ],
                    newCompIdMessages: [
                        ['1-comp1', 2],
                        ['1-comp2,a', 3],
                    ],
                });
            });
        });

        it('should auto batch and batch should place nice - both should consolidate into a single batch', async () => {
            let { port, logger, channel } = mkPort();

            let endpoint1 = port.getEndpoint(1, ['comp1']);
            endpoint1.post(MESSAGE_RENDER_1);
            let endpoint2 = port.getEndpoint(1, ['comp2', 'a']);
            endpoint2.post(MESSAGE_RENDER_2);
            port.batch(() => {
                endpoint2.post(MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD);
            });

            expect(channel.messagesFromPort).toContainEqual({
                messages: [
                    [2, MESSAGE_RENDER_1],
                    [3, MESSAGE_RENDER_2],
                    [3, MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD],
                ],
                newCompIdMessages: [
                    ['1-comp1', 2],
                    ['1-comp2,a', 3],
                ],
            });
        });
    });

    describe('compId handshake between two ports', () => {
        it('should accept compId and use it for a comp endpoint, not creating another newCompIdMessage', () => {
            let { port: port1, channel: channel1 } = mkPort();
            let { port: port2, channel: channel2 } = mkPort();

            // generate comp id on the first port
            let endpoint1 = port1.getEndpoint(1, ['comp1']);
            port1.flush();
            // send the newCompIdMessage to port2
            channel2.postMessagesToPort(
                channel1.messagesFromPort[0].messages,
                channel1.messagesFromPort[0].newCompIdMessages,
            );
            // get the endpoint on port2
            let endpoint2 = port2.getEndpoint(1, ['comp1']);
            port2.flush();
            // validate endpoint on port2 does not generate another newCompIdMessage
            expect(channel2.messagesFromPort).toContainEqual({
                messages: [],
                newCompIdMessages: [],
            });
        });

        it('should accept compId and use it for a comp endpoint, and use it for next messages', () => {
            let { port: port1, channel: channel1 } = mkPort();
            let { port: port2, channel: channel2 } = mkPort();

            // generate comp id on the first port
            let endpoint1 = port1.getEndpoint(1, ['comp1']);
            port1.flush();
            let generatedCompId = channel1.messagesFromPort[0].newCompIdMessages[0][1];
            // send the newCompIdMessage to port2
            channel2.postMessagesToPort(
                channel1.messagesFromPort[0].messages,
                channel1.messagesFromPort[0].newCompIdMessages,
            );
            // get the endpoint on port2
            let endpoint2 = port2.getEndpoint(1, ['comp1']);
            endpoint2.post(MESSAGE_RENDER_1);
            port2.flush();

            expect(channel2.messagesFromPort).toContainEqual({
                messages: [[generatedCompId, MESSAGE_RENDER_1]],
                newCompIdMessages: [],
            });
        });
    });

    describe('receive messages', () => {
        it('should support sending messages to a component based on compId', () => {
            let { port, channel } = mkPort();
            let endpointUpdate = vi.fn();

            let endpoint = port.getEndpoint(1, ['comp1']);
            port.flush();
            let compId = channel.messagesFromPort[0].newCompIdMessages[0][1];

            endpoint.onUpdate(endpointUpdate);
            channel.postMessagesToPort(
                [
                    [compId, MESSAGE_RENDER_1],
                    [compId, MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD],
                    [compId, MESSAGE_ADD_EVENT_LISTENER_CLICK_DEC],
                ],
                [],
            );

            expect(endpointUpdate).toBeCalledTimes(3);
            expect(endpointUpdate).toBeCalledWith(MESSAGE_RENDER_1);
            expect(endpointUpdate).toBeCalledWith(MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD);
            expect(endpointUpdate).toBeCalledWith(MESSAGE_ADD_EVENT_LISTENER_CLICK_DEC);
        });

        it('should support sending messages to a component before it is created, and it should receive the messages on endpoint creation', () => {
            let { port, channel } = mkPort();
            let endpointUpdate = vi.fn();

            let compId = Math.random() * 100;
            channel.postMessagesToPort(
                [
                    [compId, MESSAGE_RENDER_1],
                    [compId, MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD],
                    [compId, MESSAGE_ADD_EVENT_LISTENER_CLICK_DEC],
                ],
                [['1-comp1', compId]],
            );

            let endpoint = port.getEndpoint(1, ['comp1']);
            port.flush();

            endpoint.onUpdate(endpointUpdate);

            expect(endpointUpdate).toBeCalledTimes(3);
            expect(endpointUpdate).toBeCalledWith(MESSAGE_RENDER_1);
            expect(endpointUpdate).toBeCalledWith(MESSAGE_ADD_EVENT_LISTENER_CLICK_ADD);
            expect(endpointUpdate).toBeCalledWith(MESSAGE_ADD_EVENT_LISTENER_CLICK_DEC);
        });

        it('on publishing incoming messages during handing a message, should auto batch outgoing messages', () => {
            let { port, channel } = mkPort();

            let endpoint = port.getEndpoint(1, ['comp1']);
            port.flush();
            let compId = channel.messagesFromPort[0].newCompIdMessages[0][1];
            let endpointUpdate = (message) => {
                endpoint.post(MESSAGE_EVENT_CLICK_ADD);
                endpoint.post(MESSAGE_EVENT_CLICK_ADD);
                endpoint.post(MESSAGE_EVENT_CLICK_DEC);
            };
            endpoint.onUpdate(endpointUpdate);

            channel.postMessagesToPort([[compId, MESSAGE_RENDER_1]], []);

            expect(channel.messagesFromPort).toContainEqual({
                messages: [
                    [compId, MESSAGE_EVENT_CLICK_ADD],
                    [compId, MESSAGE_EVENT_CLICK_ADD],
                    [compId, MESSAGE_EVENT_CLICK_DEC],
                ],
                newCompIdMessages: [],
            });
        });
    });
});

class TestJayChannel implements JayChannel {
    messagesFromPort: Array<{
        messages: Array<[number, JPMMessage]>;
        newCompIdMessages: Array<[string, number]>;
    }> = [];
    handler;

    postMessagesToPort(
        messages: Array<[number, JPMMessage]>,
        newCompIdMessages: Array<[string, number]>,
    ) {
        this.handler(messages, newCompIdMessages);
    }

    onMessages(
        handler: (
            messages: Array<[number, JPMMessage]>,
            newCompIdMessages: Array<[string, number]>,
        ) => void,
    ) {
        this.handler = handler;
    }

    postMessages(
        messages: Array<[number, JPMMessage]>,
        newCompIdMessages: Array<[string, number]>,
    ) {
        this.messagesFromPort.push({ messages, newCompIdMessages });
    }
}

class TestJayPortLogger implements JayPortLogger {
    log = [];
    logInvoke(compId: number, message: JPMMessage): void {
        this.log.push({ compId, message });
    }

    logPost(compId: number, message: JPMMessage): void {
        this.log.push({ compId, message });
    }
}
