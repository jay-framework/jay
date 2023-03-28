import {describe, expect, it} from '@jest/globals'
import {mkBridgeElement, sandboxForEach} from "../lib/sandbox/sandbox-refs";
import {
    domEventMessage,
    JayEndpoint,
    JayPortInMessageHandler, JayPortMessageType,
    JPMAddEventListener,
    JPMDomEvent
} from "../lib/comm-channel";

describe('sandbox-refs', () => {
    describe('static refs', () => {
        const vs = {data: 'some data'}
        const vs2 = {data: 'some new data'}

        it('should register events --> JPMAddEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])

            bridgeElement.refs.one.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', 'one'))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": "one", "event": "click", "viewState": vs})
        })

        it('should pass the new viewState on viewState update', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])
            let callback = jest.fn();

            bridgeElement.update(vs2)
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', 'one'))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": "one", "event": "click", "viewState": vs2})
        })

        it('should add event listener using addEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])
            let callback = jest.fn();

            bridgeElement.refs.one.addEventListener('click', callback);

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should remove event listener using removeEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])
            let callback = jest.fn();

            bridgeElement.refs.one.addEventListener('click', callback);
            bridgeElement.refs.one.removeEventListener('click', callback);

            expect(endpoint.outMessages).toHaveLength(2)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
            expect(endpoint.outMessages[1].type).toBe(JayPortMessageType.removeEventListener)
            expect(endpoint.outMessages[1].eventType).toBe('click')
            expect(endpoint.outMessages[1].refName).toBe('one')
        })

        it('after removing, event handler should not be invoked', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])
            let callback = jest.fn();

            bridgeElement.refs.one.addEventListener('click', callback);
            bridgeElement.refs.one.removeEventListener('click', callback);
            endpoint.invoke(domEventMessage('click', 'one'))

            expect(callback.mock.calls).toHaveLength(0)
        })

        it.skip('should register $events --> JPMAddEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,['one', 'two'])

            bridgeElement.refs.one.$onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })
    });

    describe('dynamic forEach refs', () => {
        const vs = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'B', title: 'Beta'},
                {name: 'C', title: 'Gamma'}
            ]}
        const vs2 = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'B', title: 'Beta'},
                {name: 'C', title: 'Gamma'},
                {name: 'D', title: 'Delta'}
            ]}
        const vs3 = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'C', title: 'Gamma'},
                {name: 'D', title: 'Delta'}
            ]}
        const vs4 = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'B', title: 'Beta Beta'},
                {name: 'C', title: 'Gamma'}
            ]}

        it('should register events --> JPMAddEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,[sandboxForEach(vs => vs.items, 'name', ['one'])])

            bridgeElement.refs.one.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,[sandboxForEach(vs => vs.items, 'name', ['one'])])
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', 'B/one'))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": "B/one", "event": "click", "viewState": vs[1]})
        })

    });
})

interface TestJayEndpoint extends JayEndpoint {
    readonly outMessages: JPMAddEventListener[]
    invoke(inMessage: JPMDomEvent)
}

function mkEndpoint(): TestJayEndpoint {
    let _compId = 1;
    let _outMessages = [];
    let _handler;
    return {
        post(outMessage: JPMAddEventListener) {
            _outMessages.push(outMessage);
        },
        onUpdate(handler: JayPortInMessageHandler) {
            _handler = handler;
        },
        get compId() {
            return _compId
        },
        get outMessages() {
            return _outMessages;
        },
        invoke(inMessage: JPMDomEvent) {
            _handler(inMessage)
        }
    }
}
