import {describe, expect, it} from '@jest/globals'
import {
    mkBridgeElement,
    sandboxElement as e,
    sandboxDynamicElement as de,
    sandboxForEach as forEach
} from "../lib/sandbox/sandbox-refs";
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
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])

            bridgeElement.refs.one.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["one"], "event": "click", "viewState": vs})
        })

        it('should pass the new viewState on viewState update', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])
            let callback = jest.fn();

            bridgeElement.update(vs2)
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["one"], "event": "click", "viewState": vs2})
        })

        it('should add event listener using addEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])
            let callback = jest.fn();

            bridgeElement.refs.one.addEventListener('click', callback);

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should remove event listener using removeEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])
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
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])
            let callback = jest.fn();

            bridgeElement.refs.one.addEventListener('click', callback);
            bridgeElement.refs.one.removeEventListener('click', callback);
            endpoint.invoke(domEventMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(0)
        })

        it.skip('should register $events --> JPMAddEventListener', () => {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [e('one'), e('two')])

            bridgeElement.refs.one.$onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })
    });

    describe('dynamic forEach refs - one level', () => {
        const baseViewState = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'B', title: 'Beta'},
                {name: 'C', title: 'Gamma'}
            ]}
        const addItemViewState = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'B', title: 'Beta'},
                {name: 'C', title: 'Gamma'},
                {name: 'D', title: 'Delta'}
            ]}
        const addAndRemoveItemViewState = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'C', title: 'Gamma'},
                {name: 'D', title: 'Delta'}
            ]}
        const updateItemViewState = {items: [
                {name: 'A', title: 'Alpha'},
                {name: 'B', title: 'Beta Beta'},
                {name: 'C', title: 'Gamma'}
            ]}

        function setup() {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(baseViewState, endpoint,() => [
                forEach(vs => vs.items, 'name', () => [de('one')])
            ], ['one'])
            return {endpoint, bridgeElement}
        }

        it('should register events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            bridgeElement.refs.one.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['B', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B","one"], "event": "click", "viewState": baseViewState.items[1]})
        })

        it('in case of event with coordinate of non existing element, should not throw error, but instead return undefined viewState', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['D', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["D","one"], "event": "click", "viewState": undefined})
        })

        it('in case of event with coordinate of a removed element, should not throw error, but instead return undefined viewState', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(addAndRemoveItemViewState);
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['B', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B","one"], "event": "click", "viewState": undefined})
        })

        it('should support viewState updates - additional item', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(addItemViewState)
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['D', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["D","one"], "event": "click", "viewState": addItemViewState.items[3]})
        })

        it('should support viewState updates - updated item', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(updateItemViewState)
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['B', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B","one"], "event": "click", "viewState": updateItemViewState.items[1]})
        })
    });

    describe('dynamic foreach refs - multi-level', () => {
        const vs = {items: [
                {name: 'A', title: 'Alpha', subItems: [{id: '1', name: 'one'}, {id: '2', name: 'two'}]},
                {name: 'B', title: 'Beta', subItems: [{id: '3', name: 'three'}, {id: '4', name: 'four'}]},
                {name: 'C', title: 'Gamma', subItems: [{id: '5', name: 'five'}, {id: '6', name: 'six'}]},
                {name: 'D', title: 'Delta', subItems: [{id: '7', name: 'seven'}, {id: '8', name: 'eight'}]},
            ]}
        const vs2 = {items: [
                {name: 'A', title: 'Alpha', subItems: [{id: '1', name: 'one'}, {id: '2', name: 'two'}, {id: '2.5', name: 'two and half'}]},
                {name: 'B', title: 'Beta', subItems: [{id: '3', name: 'three'}]},
                {name: 'C', title: 'Gamma', subItems: [{id: '5', name: 'five changed'}, {id: '6', name: 'six'}]},
                {name: 'E', title: 'epsilon', subItems: [{id: '9', name: 'nine'}, {id: '10', name: 'ten'}]},
            ]}

        type VS = typeof vs;
        type VSItem = typeof vs.items[number]
        type VSSubItem = VSItem["subItems"][number]

        function setup() {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [
                forEach<VS, VSItem>(vs => vs.items, 'name', () => [
                    de('one'),
                    forEach<VSItem, VSSubItem>(vs => vs.subItems, 'id', () => [
                        de('two')
                    ])
                ])
            ], ['one', 'two'])
            return {endpoint, bridgeElement}
        }

        it('should register events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            bridgeElement.refs.one.onclick(() => {});
            bridgeElement.refs.two.onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(2)
            expect(endpoint.outMessages[0].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[0].eventType).toBe('click')
            expect(endpoint.outMessages[0].refName).toBe('one')
            expect(endpoint.outMessages[1].type).toBe(JayPortMessageType.addEventListener)
            expect(endpoint.outMessages[1].eventType).toBe('click')
            expect(endpoint.outMessages[1].refName).toBe('two')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.refs.two.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['B', '3', 'two']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B", '3', "two"], "event": "click", "viewState": vs.items[1].subItems[0]})
        })

    })
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
