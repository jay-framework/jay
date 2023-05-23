import {describe, expect, it} from '@jest/globals'
import {JayPort, JayPortLogger} from "../../lib/comm-channel/jay-port";
import {JayChannel, JPMMessage} from "../../lib/comm-channel/comm-channel";
import {addEventListenerMessage, renderMessage} from "../../lib/comm-channel/messages";

describe('jay-port', () => {

    function mkPort() {
        let channel: TestJayChannel = new TestJayChannel();
        let logger: TestJayPortLogger = new TestJayPortLogger();
        let port = new JayPort(channel, logger);
        return {channel, logger, port}
    }

    describe('sending messages', () => {

        it('should generate compId and send it as a message', () => {
            let {port, logger, channel} = mkPort();

            let endpoint = port.getEndpoint(1, ['comp1'])
            port.flush();

            expect(channel.messagesFromPort).toContainEqual({messages: [], newCompIdMessages: [["1-comp1", 2]]})
        })

        it('should send a component message', () => {
            let {port, logger, channel} = mkPort();

            let endpoint = port.getEndpoint(1, ['comp1'])
            endpoint.post(renderMessage({foo: 'bar'}))
            port.flush();

            expect(channel.messagesFromPort)
                .toContainEqual({
                    messages: [[2, renderMessage({foo: 'bar'})]],
                    newCompIdMessages: [["1-comp1", 2]]})
        })

        it('should send a component message using batch', () => {
            let {port, logger, channel} = mkPort();

            port.batch(() => {
                let endpoint = port.getEndpoint(1, ['comp1'])
                endpoint.post(renderMessage({foo: 'bar'}))
            })

            expect(channel.messagesFromPort)
                .toContainEqual({
                    messages: [[2, renderMessage({foo: 'bar'})]],
                    newCompIdMessages: [["1-comp1", 2]]})
        })

        it('should send multiple components and multiple messages', () => {
            let {port, logger, channel} = mkPort();

            port.batch(() => {
                let endpoint1 = port.getEndpoint(1, ['comp1'])
                endpoint1.post(renderMessage({foo: 'bar'}))
                let endpoint2 = port.getEndpoint(1, ['comp2', 'a'])
                endpoint2.post(renderMessage({foo: 'poo'}))
                endpoint2.post(addEventListenerMessage('add', 'click'))
            })

            expect(channel.messagesFromPort)
                .toContainEqual({
                    messages: [[2, renderMessage({foo: 'bar'})],
                        [3, renderMessage({foo: 'poo'})],
                        [3, addEventListenerMessage('add', 'click')]],
                    newCompIdMessages: [["1-comp1", 2], ["1-comp2,a", 3]]})
        })
    })

    describe('compId handshake between two ports', () => {
        it('should accept compId and use it for a comp endpoint, not creating another newCompIdMessage', () => {
            let {port: port1, channel: channel1} = mkPort();
            let {port: port2, channel: channel2} = mkPort();

            // generate comp id on the first port
            let endpoint1 = port1.getEndpoint(1, ['comp1'])
            port1.flush();
            // send the newCompIdMessage to port2
            channel2.postMessagesToPort(channel1.messagesFromPort[0].messages, channel1.messagesFromPort[0].newCompIdMessages)
            // get the endpoint on port2
            let endpoint2 = port2.getEndpoint(1, ['comp1'])
            port2.flush();
            // validate endpoint on port2 does not generate another newCompIdMessage
            expect(channel2.messagesFromPort).toContainEqual({messages: [], newCompIdMessages: []})
        })

        it('should accept compId and use it for a comp endpoint, and use it for next messages', () => {
            let {port: port1, channel: channel1} = mkPort();
            let {port: port2, channel: channel2} = mkPort();

            // generate comp id on the first port
            let endpoint1 = port1.getEndpoint(1, ['comp1'])
            port1.flush();
            let generatedCompId = channel1.messagesFromPort[0].newCompIdMessages[0][1];
            // send the newCompIdMessage to port2
            channel2.postMessagesToPort(channel1.messagesFromPort[0].messages, channel1.messagesFromPort[0].newCompIdMessages)
            // get the endpoint on port2
            let endpoint2 = port2.getEndpoint(1, ['comp1'])
            endpoint2.post(renderMessage({foo: 'bar'}))
            port2.flush();

            expect(channel2.messagesFromPort).toContainEqual({messages: [[generatedCompId, renderMessage({foo: 'bar'})]], newCompIdMessages: []})
        })
    })

})

class TestJayChannel implements JayChannel {
    messagesFromPort: Array<{messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>}> = []
    handler;

    postMessagesToPort(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) {
        this.handler(messages, newCompIdMessages);
    }

    onMessages(handler: (messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) => void) {
        this.handler = handler
    }

    postMessages(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>) {
        this.messagesFromPort.push({messages, newCompIdMessages})
    }
}

class TestJayPortLogger implements JayPortLogger {
    log = [];
    logInvoke(compId: number, message: JPMMessage): void {
        this.log.push({compId, message})
    }

    logPost(compId: number, message: JPMMessage): void {
        this.log.push({compId, message})
    }
}