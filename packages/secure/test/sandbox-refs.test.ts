import {describe, expect, it} from '@jest/globals'
import {
    mkBridgeElement,
    sandboxElement as e,
    sandboxDynamicElement as de,
    sandboxForEach as forEach,
    SandboxCondition as c
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

        it('should support view state updates', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2);
            bridgeElement.refs.two.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['A', '2.5', 'two'])) // added sub item
            endpoint.invoke(domEventMessage('click', ['B', '4', 'two'])) // removed sub item
            endpoint.invoke(domEventMessage('click', ['C', '5', 'two'])) // updated sub item
            endpoint.invoke(domEventMessage('click', ['D', '6', 'two'])) // removed item
            endpoint.invoke(domEventMessage('click', ['E', '9', 'two'])) // added item

            expect(callback.mock.calls).toHaveLength(5)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["A", '2.5', "two"], "event": "click", "viewState": vs2.items[0].subItems[2]})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ["B", '4', "two"], "event": "click", "viewState": undefined})
            expect(callback.mock.calls[2][0]).toEqual({"coordinate": ["C", '5', "two"], "event": "click", "viewState": vs2.items[2].subItems[0]})
            expect(callback.mock.calls[3][0]).toEqual({"coordinate": ["D", '6', "two"], "event": "click", "viewState": undefined})
            expect(callback.mock.calls[4][0]).toEqual({"coordinate": ["E", '9', "two"], "event": "click", "viewState": vs2.items[3].subItems[0]})
        })
    })

    describe("dynamic condition", () => {
        const vs = {condition: true, condition2: true}
        const vs2 = {condition: false, condition2: true}
        const vs3 = {condition: true, condition2: false}
        const vs4 = {condition: false, condition2: false}

        function setup(creationViewState = vs) {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(creationViewState, endpoint,() => [
                c(vs => vs.condition, [
                    e('one'),
                    c(vs => vs.condition2, [e('two')])
                ])
            ], [])
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
            endpoint.invoke(domEventMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['one'], "event": "click", "viewState": vs})
        })

        it('should trigger event even if condition === false', () => {
            let {endpoint, bridgeElement} = setup(vs2);
            let callback = jest.fn();

            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['one'], "event": "click", "viewState": vs2})
        })

        it('should trigger with if condition updated to false', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2)
            bridgeElement.refs.one.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['one'], "event": "click", "viewState": vs2})
        })

        it('should support nested conditions', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.refs.two.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['two']))
            bridgeElement.update(vs2)
            endpoint.invoke(domEventMessage('click', ['two']))
            bridgeElement.update(vs3)
            endpoint.invoke(domEventMessage('click', ['two']))
            bridgeElement.update(vs4)
            endpoint.invoke(domEventMessage('click', ['two']))

            expect(callback.mock.calls).toHaveLength(4)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['two'], "event": "click", "viewState": vs})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ['two'], "event": "click", "viewState": vs2})
            expect(callback.mock.calls[2][0]).toEqual({"coordinate": ['two'], "event": "click", "viewState": vs3})
            expect(callback.mock.calls[3][0]).toEqual({"coordinate": ['two'], "event": "click", "viewState": vs4})
        })
    })

    describe('dynamic foreach + condition', () => {
        const vs = {items: [
                {name: 'A', title: 'Alpha', test: true},
                {name: 'B', title: 'Beta', test: true},
                {name: 'C', title: 'Gamma', test: false},
                {name: 'D', title: 'Delta', test: false},
            ]}
        const vs2 = {items: [
                {name: 'A', title: 'Alpha', test: true},
                {name: 'B', title: 'Beta', test: false},
                {name: 'C', title: 'Gamma', test: false},
                {name: 'E', title: 'epsilon', test: true},
            ]}

        type VS = typeof vs;
        type VSItem = typeof vs.items[number]

        function setup() {
            let endpoint = mkEndpoint();
            let bridgeElement = mkBridgeElement(vs, endpoint,() => [
                forEach<VS, VSItem>(vs => vs.items, 'name', () => [
                    de('one'),
                    c(vs => vs.test, [
                        de('two')
                    ])
                ])
            ], ['one', 'two'])
            return {endpoint, bridgeElement}
        }

        it('should trigger events with view state for mounted elements, and with undefined for unmounted elements (parent condition === false)', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.refs.two.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['A', 'two']))
            endpoint.invoke(domEventMessage('click', ['B', 'two']))
            endpoint.invoke(domEventMessage('click', ['C', 'two']))
            endpoint.invoke(domEventMessage('click', ['D', 'two']))

            expect(callback.mock.calls).toHaveLength(4)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["A", "two"], "event": "click", "viewState": vs.items[0]})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ["B", "two"], "event": "click", "viewState": vs.items[1]})
            expect(callback.mock.calls[2][0]).toEqual({"coordinate": ["C", "two"], "event": "click", "viewState": undefined})
            expect(callback.mock.calls[3][0]).toEqual({"coordinate": ["D", "two"], "event": "click", "viewState": undefined})
        })

        it('after update, should trigger events with view state for mounted elements, and with undefined for unmounted elements (parent condition === false)', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2)
            bridgeElement.refs.two.onclick(callback);
            endpoint.invoke(domEventMessage('click', ['A', 'two']))
            endpoint.invoke(domEventMessage('click', ['B', 'two']))
            endpoint.invoke(domEventMessage('click', ['C', 'two']))
            endpoint.invoke(domEventMessage('click', ['E', 'two']))

            expect(callback.mock.calls).toHaveLength(4)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["A", "two"], "event": "click", "viewState": vs2.items[0]})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ["B", "two"], "event": "click", "viewState": undefined})
            expect(callback.mock.calls[2][0]).toEqual({"coordinate": ["C", "two"], "event": "click", "viewState": undefined})
            expect(callback.mock.calls[3][0]).toEqual({"coordinate": ["E", "two"], "event": "click", "viewState": vs2.items[3]})
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
