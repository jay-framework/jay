import {describe, expect, it} from '@jest/globals'
import {mkRefs} from "../lib/sandbox/sandbox-refs";
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
        it('should register events --> JPMAddEventListener', () => {
            let endpoint = mkEndpoint();
            let refs = mkRefs(['one', 'two'], endpoint, vs)

            refs.one.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let endpoint = mkEndpoint();
            let refs = mkRefs(['one', 'two'], endpoint, vs)
            let callback = jest.fn();

            refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', 'one'))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": "one", "event": "click", "viewState": {"data": "some data"}})
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
