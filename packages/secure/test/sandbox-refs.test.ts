import {describe, expect, it} from '@jest/globals'
import {mkBridgeElement} from "../lib/sandbox/sandbox-refs";
import {
    domEventMessage,
    JayEndpoint,
    JayPortInMessageHandler,
    JPMAddEventListener,
    JPMDomEvent
} from "../lib/comm-channel";

describe('sandbox-refs', () => {
    describe('static refs', () => {
        const vs = {data: 'some data'}
        const vs2 = {data: 'some new data'}
        it('should register events --> JPMAddEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(['one', 'two'], endpoint, vs)

            bridgeElement.refs.one.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(['one', 'two'], endpoint, vs)
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', 'one'))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": "one", "event": "click", "viewState": vs})
        })

        it('should pass the new viewState on viewState update', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(['one', 'two'], endpoint, vs)
            let callback = jest.fn();

            bridgeElement.update(vs2)
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', 'one'))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": "one", "event": "click", "viewState": vs2})
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
