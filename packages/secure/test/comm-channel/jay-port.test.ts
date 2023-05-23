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

            expect(channel.messagesFromPort).toContainEqual({messages: [], newCompIdMessages: [["1-comp1", 1]]})
        })

        it('should send a component message', () => {
            let {port, logger, channel} = mkPort();

            let endpoint = port.getEndpoint(1, ['comp1'])
            endpoint.post(renderMessage({foo: 'bar'}))
            port.flush();

            expect(channel.messagesFromPort)
                .toContainEqual({
                    messages: [[1, renderMessage({foo: 'bar'})]],
                    newCompIdMessages: [["1-comp1", 1]]})
        })

        it('should send a component message using batch', () => {
            let {port, logger, channel} = mkPort();

            port.batch(() => {
                let endpoint = port.getEndpoint(1, ['comp1'])
                endpoint.post(renderMessage({foo: 'bar'}))
            })

            expect(channel.messagesFromPort)
                .toContainEqual({
                    messages: [[1, renderMessage({foo: 'bar'})]],
                    newCompIdMessages: [["1-comp1", 1]]})
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
                    messages: [[1, renderMessage({foo: 'bar'})],
                        [2, renderMessage({foo: 'poo'})],
                        [2, addEventListenerMessage('add', 'click')]],
                    newCompIdMessages: [["1-comp1", 1], ["1-comp2,a", 2]]})
        })
    })

})

class TestJayChannel implements JayChannel {
    messagesFromPort = []
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