import {describe, expect, it} from '@jest/globals'
import {
    compCollectionRef,
    compRef,
    elemCollectionRef,
    elemRef,
    mkBridgeElement
} from "../../lib/";
import {
    IJayEndpoint, IJayPort,
    JayPortInMessageHandler
} from "../../lib";
import {Reactive} from "jay-reactive";
import {$func, $handler} from "../../lib";
import {ComponentCollectionProxy, Coordinate, HTMLElementCollectionProxy, HTMLElementProxy} from "jay-runtime";
import {
    sandboxCondition as c,
    sandboxElement as e,
    sandboxForEach as forEach,
    sandboxChildComp as childComp
} from "../../lib/sandbox/sandbox-element";
import {clearInstances, componentInstance, Item, ItemProps, ItemType} from "./item-component/item";
import {
    eventInvocationMessage,
    JayPortMessageType,
    JPMAddEventListener, JPMDomEvent, JPMNativeExec, JPMNativeExecResult,
    nativeExecResult
} from "../../lib/comm-channel/messages";

const getNullComponentInstance = () => undefined;
describe('sandbox-refs', () => {
    describe('static refs', () => {
        const vs = {data: 'some data'}
        const vs2 = {data: 'some new data'}
        type ViewState = typeof vs;

        function setup() {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let bridgeElement =
                mkBridgeElement(vs,() => [
                        e(elemRef('one')),
                        e(elemRef('two'))
                    ], [], [],
                    endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement}

        }

        it('should register events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementProxy<any, any>).onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["one"], "event": undefined, "viewState": vs})
        })

        it('should pass the new viewState on viewState update', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2);
            (bridgeElement.refs.one as HTMLElementProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["one"], "event": undefined, "viewState": vs2})
        })

        it('should add event listener using addEventListener', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementProxy<any, any>).addEventListener('click', callback);

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
        })

        it('should remove event listener using removeEventListener', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementProxy<any, any>).addEventListener('click', callback);
            (bridgeElement.refs.one as HTMLElementProxy<any, any>).removeEventListener('click', callback);

            expect(endpoint.outMessages).toHaveLength(2)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
            let message1 = endpoint.outMessages[1] as JPMAddEventListener
            expect(message1.type).toBe(JayPortMessageType.removeEventListener)
            expect(message1.eventType).toBe('click')
            expect(message1.refName).toBe('one')
        })

        it('after removing, event handler should not be invoked', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementProxy<any, any>).addEventListener('click', callback);
            (bridgeElement.refs.one as HTMLElementProxy<any, any>).removeEventListener('click', callback);
            endpoint.invoke(eventInvocationMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(0)
        })

        it('should register $events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementProxy<any, any>).$onclick($handler("1"));

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
            expect(message.nativeId).toBe('1')
        })

        it('should run $exec --> JPMNativeExec', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementProxy<ViewState, HTMLDivElement>).$exec($func("3"));

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMNativeExec
            expect(message.type).toBe(JayPortMessageType.nativeExec)
            expect(message.refName).toBe('one')
            expect(message.nativeId).toBe('3')
            expect(typeof message.correlationId).toBe('number')
        })

        it('should run $exec --> JPMNativeExec --> JPMNativeExecResult (success)', async () => {
            let {endpoint, bridgeElement} = setup();

            let $result = (bridgeElement.refs.one as HTMLElementProxy<ViewState, HTMLDivElement>).$exec($func("3"));
            let execMessage = endpoint.outMessages[0] as JPMNativeExec
            endpoint.invoke(nativeExecResult(execMessage.correlationId, 12, undefined, 'one'))
            let result = await $result;

            expect(result).toBe(12)
        })

        it('should run $exec --> JPMNativeExec --> JPMNativeExecResult (fail)', async () => {
            let {endpoint, bridgeElement} = setup();

            let $result = (bridgeElement.refs.one as HTMLElementProxy<ViewState, HTMLDivElement>).$exec($func("3"));
            let execMessage = endpoint.outMessages[0] as JPMNativeExec
            endpoint.invoke(nativeExecResult(execMessage.correlationId, undefined, "failed", 'one'))

            await expect($result).rejects.toEqual('failed');
        })
    });

    describe('dynamic forEach refs - one level', () => {
        interface Item {
            name: string,
            title: string
        }
        const A = {name: 'A', title: 'Alpha'}
        const B = {name: 'B', title: 'Beta'}
        const B2 = {name: 'B', title: 'Beta Beta'}
        const C = {name: 'C', title: 'Gamma'}
        const D = {name: 'D', title: 'Delta'}

        const baseViewState =             {items: [A, B,  C]}
        const addItemViewState =          {items: [A, B,  C, D]}
        const addAndRemoveItemViewState = {items: [A,     C, D]}
        const updateItemViewState =       {items: [A, B2, C]}
        const empty =                     {items: []}

        function setup(vs = baseViewState) {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let childElementUpdateSpies = [];
            let bridgeElement =
                mkBridgeElement(vs, () => {
                    const refOne = elemCollectionRef('one')
                    return [
                        forEach(vs => vs.items, 'name', () => {
                            let childElement = e(refOne());
                            childElementUpdateSpies.push(jest.spyOn(childElement, 'update'));
                            return [childElement]
                        })
                    ]}, ['one'], [],
                        endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement, childElementUpdateSpies}
        }

        it('should register events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener;
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
        })

        it('should register events --> JPMAddEventListener also if items is an empty array', () => {
            let {endpoint, bridgeElement} = setup(empty);

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener;
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
        })

        it('should register $events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).$onclick($handler("2"));

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
            expect(message.nativeId).toBe('2')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['B', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B","one"], "event": undefined, "viewState": baseViewState.items[1]})
        })

        it('in case of event with coordinate of non existing element, should not trigger the event', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['D', 'one']))

            expect(callback.mock.calls).toHaveLength(0)
            // expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["D","one"], "event": undefined, "viewState": undefined})
        })

        it('in case of event with coordinate of a removed element, should not trigger the event', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(addAndRemoveItemViewState);
            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['B', 'one']))

            expect(callback.mock.calls).toHaveLength(0)
            // expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B","one"], "event": undefined, "viewState": undefined})
        })

        it('should support viewState updates - additional item', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(addItemViewState);
            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['D', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["D","one"], "event": undefined, "viewState": addItemViewState.items[3]})
        })

        it('should support viewState and child element updates - updated item', () => {
            let {endpoint, bridgeElement, childElementUpdateSpies} = setup();
            let callback = jest.fn();

            bridgeElement.update(updateItemViewState);

            // expect the second item update to have been called
            expect(childElementUpdateSpies[1].mock.calls.length).toBe(1);

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['B', 'one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B","one"], "event": undefined, "viewState": B2})
        })

        describe('find', () => {
            it('should run find --> $exec --> JPMNativeExec', () => {
                let {endpoint, bridgeElement} = setup();

                (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .find(item => item.title === B.title)
                    .$exec($func("4"));

                expect(endpoint.outMessages).toHaveLength(1)
                let message = endpoint.outMessages[0] as JPMNativeExec
                expect(message.type).toBe(JayPortMessageType.nativeExec)
                expect(message.refName).toBe('one')
                expect(message.nativeId).toBe('4')
                expect(message.coordinate).toEqual([B.name, 'one'])
                expect(typeof message.correlationId).toBe('number')
            })

            it('should run find --> $exec --> JPMNativeExec --> JPMNativeExecResult (success)', async () => {
                let {endpoint, bridgeElement} = setup();

                let $result = (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .find(item => item.title === B.title)
                    .$exec($func("4"));
                let execMessage = endpoint.outMessages[0] as JPMNativeExec
                endpoint.invoke(nativeExecResult(execMessage.correlationId, 14, undefined, 'one'))
                let result = await $result;

                expect(result).toEqual(14)
            })

            it('should run find --> undefined for non existing view state', () => {
                let {bridgeElement} = setup();

                let findResult = (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .find(item => item.title === 'non existing item');

                expect(findResult).not.toBeDefined()
            })
        })

        describe('map', () => {
            it('should run map handler on all items - passing view state and coordinate', () => {
                let {bridgeElement} = setup();

                let viewStateSet = new Set();
                let coordinateSet = new Set();
                (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .map((element, viewState, coordinate) => {
                        viewStateSet.add(viewState)
                        coordinateSet.add(coordinate)
                    })

                expect(viewStateSet).toContain(A)
                expect(viewStateSet).toContain(B)
                expect(viewStateSet).toContain(C)
                expect(coordinateSet).toContainEqual([A.name, 'one'])
                expect(coordinateSet).toContainEqual([B.name, 'one'])
                expect(coordinateSet).toContainEqual([C.name, 'one'])
            })

            it('should map items to some result', () => {
                let {bridgeElement} = setup();

                let mapResult = (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .map((element, viewState, coordinate) => {
                        return {viewState, coordinate}
                    })

                expect(mapResult).toContainEqual({viewState: A, coordinate: [A.name, 'one']})
                expect(mapResult).toContainEqual({viewState: B, coordinate: [B.name, 'one']})
                expect(mapResult).toContainEqual({viewState: C, coordinate: [C.name, 'one']})
            })

            it('should support $exec on the element --> $exec --> JPMNativeExec', () => {
                let {endpoint, bridgeElement} = setup();

                (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .map((element) => {
                        element.$exec($func("4"))
                    })
                expect(endpoint.outMessages.length).toBe(3)
                let execMessageA = endpoint.outMessages[0] as JPMNativeExec
                let execMessageB = endpoint.outMessages[1] as JPMNativeExec
                let execMessageC = endpoint.outMessages[2] as JPMNativeExec

                expect(execMessageA.type).toBe(JayPortMessageType.nativeExec)
                expect(execMessageA.refName).toBe('one')
                expect(execMessageA.nativeId).toBe('4')
                expect(execMessageA.coordinate).toEqual([A.name, 'one'])
                expect(typeof execMessageA.correlationId).toBe('number')

                expect(execMessageB.type).toBe(JayPortMessageType.nativeExec)
                expect(execMessageB.refName).toBe('one')
                expect(execMessageB.nativeId).toBe('4')
                expect(execMessageB.coordinate).toEqual([B.name, 'one'])
                expect(typeof execMessageB.correlationId).toBe('number')

                expect(execMessageC.type).toBe(JayPortMessageType.nativeExec)
                expect(execMessageC.refName).toBe('one')
                expect(execMessageC.nativeId).toBe('4')
                expect(execMessageC.coordinate).toEqual([C.name, 'one'])
                expect(typeof execMessageC.correlationId).toBe('number')
            })

            it('should support $exec on the element --> $exec --> JPMNativeExec --> JPMNativeExecResult (success)', async () => {
                let {endpoint, bridgeElement} = setup();

                let $mapResult = (bridgeElement.refs.one as HTMLElementCollectionProxy<Item, HTMLDivElement>)
                    .map((element) => {
                        return element.$exec($func("4"))
                    })
                expect(endpoint.outMessages.length).toBe(3)
                let execMessageA = endpoint.outMessages[0] as JPMNativeExec
                let execMessageB = endpoint.outMessages[1] as JPMNativeExec
                let execMessageC = endpoint.outMessages[2] as JPMNativeExec

                endpoint.invoke(nativeExecResult(execMessageA.correlationId, 20, undefined, 'one'))
                endpoint.invoke(nativeExecResult(execMessageB.correlationId, 30, undefined, 'one'))
                endpoint.invoke(nativeExecResult(execMessageC.correlationId, 40, undefined, 'one'))

                let mapResults = await Promise.all($mapResult);

                expect(mapResults[0]).toBe(20)
                expect(mapResults[1]).toBe(30)
                expect(mapResults[2]).toBe(40)
            })
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
            let reactive = new Reactive();
            let bridgeElement = mkBridgeElement(vs,() => {
                const refOne = elemCollectionRef('one')
                const refTwo = elemCollectionRef('two')
                return [
                    forEach<VS, VSItem>(vs => vs.items, 'name', () => [
                        e(refOne()),
                        forEach<VSItem, VSSubItem>(vs => vs.subItems, 'id', () => [
                            e(refTwo())
                        ])
                    ])
                ]}, [], [],
                    endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement}
        }

        it('should register events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(() => {});
            (bridgeElement.refs.two as HTMLElementCollectionProxy<any, any>).onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(2)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
            let message1 = endpoint.outMessages[1] as JPMAddEventListener
            expect(message1.type).toBe(JayPortMessageType.addEventListener)
            expect(message1.eventType).toBe('click')
            expect(message1.refName).toBe('two')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.two as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['B', '3', 'two']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["B", '3', "two"], "event": undefined, "viewState": vs.items[1].subItems[0]})
        })

        it('should support view state updates', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2);
            (bridgeElement.refs.two as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['A', '2.5', 'two'])) // added sub item
            endpoint.invoke(eventInvocationMessage('click', ['B', '4', 'two'])) // removed sub item
            endpoint.invoke(eventInvocationMessage('click', ['C', '5', 'two'])) // updated sub item
            endpoint.invoke(eventInvocationMessage('click', ['D', '6', 'two'])) // removed item
            endpoint.invoke(eventInvocationMessage('click', ['E', '9', 'two'])) // added item

            expect(callback.mock.calls).toHaveLength(3)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["A", '2.5', "two"], "event": undefined, "viewState": vs2.items[0].subItems[2]})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ["C", '5', "two"], "event": undefined, "viewState": vs2.items[2].subItems[0]})
            expect(callback.mock.calls[2][0]).toEqual({"coordinate": ["E", '9', "two"], "event": undefined, "viewState": vs2.items[3].subItems[0]})
        })
    })

    describe("dynamic condition", () => {
        const vs = {condition: true, condition2: true}
        const vs2 = {condition: false, condition2: true}
        const vs3 = {condition: true, condition2: false}
        const vs4 = {condition: false, condition2: false}

        function setup(creationViewState = vs) {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let bridgeElement = mkBridgeElement(creationViewState, () => [
                c(vs => vs.condition, [
                    e(elemRef('one')),
                    c(vs => vs.condition2, [e(elemRef('two'))])
                ])
            ], [], [], endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement}
        }

        it('should register events --> JPMAddEventListener', () => {
            let {endpoint, bridgeElement} = setup();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(() => {});

            expect(endpoint.outMessages).toHaveLength(1)
            let message = endpoint.outMessages[0] as JPMAddEventListener
            expect(message.type).toBe(JayPortMessageType.addEventListener)
            expect(message.eventType).toBe('click')
            expect(message.refName).toBe('one')
        })

        it('should trigger events on JPMDomEvent --> callback', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['one'], "event": undefined, "viewState": vs})
        })

        it('should trigger event even if condition === false', () => {
            let {endpoint, bridgeElement} = setup(vs2);
            let callback = jest.fn();

            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['one'], "event": undefined, "viewState": vs2})
        })

        it('should trigger with if condition updated to false', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2);
            (bridgeElement.refs.one as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['one']))

            expect(callback.mock.calls).toHaveLength(1)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['one'], "event": undefined, "viewState": vs2})
        })

        it('should support nested conditions', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.two as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['two']))
            bridgeElement.update(vs2)
            endpoint.invoke(eventInvocationMessage('click', ['two']))
            bridgeElement.update(vs3)
            endpoint.invoke(eventInvocationMessage('click', ['two']))
            bridgeElement.update(vs4)
            endpoint.invoke(eventInvocationMessage('click', ['two']))

            expect(callback.mock.calls).toHaveLength(4)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ['two'], "event": undefined, "viewState": vs})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ['two'], "event": undefined, "viewState": vs2})
            expect(callback.mock.calls[2][0]).toEqual({"coordinate": ['two'], "event": undefined, "viewState": vs3})
            expect(callback.mock.calls[3][0]).toEqual({"coordinate": ['two'], "event": undefined, "viewState": vs4})
        })
    })

    describe('dynamic foreach + condition', () => {
        const A = {name: 'A', title: 'Alpha', test: true}
        const B1 = {name: 'B', title: 'Beta', test: true}
        const B2 = {name: 'B', title: 'Beta', test: false}
        const C = {name: 'C', title: 'Gamma', test: false}
        const D = {name: 'D', title: 'Delta', test: false}
        const E = {name: 'E', title: 'epsilon', test: true}
        const vs = {items: [A, B1, C, D]}
        const vs2 = {items: [A, B2, C, E]}

        type VS = typeof vs;
        type VSItem = typeof vs.items[number]

        function setup() {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let bridgeElement = mkBridgeElement(vs, () => {
                const refOne = elemCollectionRef('one')
                const refTwo = elemCollectionRef('two')
                return [
                    forEach<VS, VSItem>(vs => vs.items, 'name', () => [
                        e(refOne()),
                        c(vs => vs.test, [
                            e(refTwo())
                        ])
                    ])
                ]}, ['one', 'two'], [], endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement}
        }

        it('should trigger events with view state for mounted elements, and with undefined for unmounted elements (parent condition === false)', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.two as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['A', 'two']))
            endpoint.invoke(eventInvocationMessage('click', ['B', 'two']))
            endpoint.invoke(eventInvocationMessage('click', ['C', 'two']))
            endpoint.invoke(eventInvocationMessage('click', ['D', 'two']))

            expect(callback.mock.calls).toHaveLength(2)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["A", "two"], "event": undefined, "viewState": vs.items[0]})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ["B", "two"], "event": undefined, "viewState": vs.items[1]})
        })

        it('after update, should trigger events with view state for mounted elements, and with undefined for unmounted elements (parent condition === false)', () => {
            let {endpoint, bridgeElement} = setup();
            let callback = jest.fn();

            bridgeElement.update(vs2);
            (bridgeElement.refs.two as HTMLElementCollectionProxy<any, any>).onclick(callback);
            endpoint.invoke(eventInvocationMessage('click', ['A', 'two']))
            endpoint.invoke(eventInvocationMessage('click', ['B', 'two']))
            endpoint.invoke(eventInvocationMessage('click', ['C', 'two']))
            endpoint.invoke(eventInvocationMessage('click', ['E', 'two']))

            expect(callback.mock.calls).toHaveLength(2)
            expect(callback.mock.calls[0][0]).toEqual({"coordinate": ["A", "two"], "event": undefined, "viewState": vs2.items[0]})
            expect(callback.mock.calls[1][0]).toEqual({"coordinate": ["E", "two"], "event": undefined, "viewState": vs2.items[3]})
        })
    })

    describe('static component', () => {

        const vs: ItemProps = {text: 'some data', dataId: 'a'}
        const vs2: ItemProps = {text: 'some new data', dataId: 'a'}

        beforeEach(() => {
            clearInstances();
        })

        type CompType = ItemType<ItemProps>;

        function setup() {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let bridgeElement = mkBridgeElement(vs, () => [
                childComp(Item, vs => vs, compRef('comp1'))
            ], [], [], endpoint, reactive, getNullComponentInstance, [])
            let childCompRef = bridgeElement.refs.comp1 as CompType;
            return {endpoint, bridgeElement, childCompRef}
        }

        it('should create the component with the provided props', () => {
            let {childCompRef} = setup();

            expect(childCompRef.getItemSummary()).toBe('item some data - Done: false - mounted: true')
        })

        it('should update the component with the new props', () => {
            let {bridgeElement, childCompRef} = setup();

            bridgeElement.update(vs2)

            expect(childCompRef.getItemSummary()).toBe('item some new data - Done: false - mounted: true')
        })

        it('should register and invoke events on the component', () => {
            let {childCompRef} = setup();
            let callback = jest.fn();

            childCompRef.addEventListener('remove', callback)
            childCompRef._removeClick();

            expect(callback.mock.calls.length).toBe(1)
            expect(callback.mock.calls[0][0]).toEqual({
                event: 'item some data - false is removed',
                viewState: vs,
                coordinate: ['comp1']
            })
        })

        it('should update the event view state on component update', () => {
            let {bridgeElement, childCompRef} = setup();
            let callback = jest.fn();

            childCompRef.addEventListener('remove', callback)
            bridgeElement.update(vs2);
            childCompRef._removeClick();

            expect(callback.mock.calls.length).toBe(1)
            expect(callback.mock.calls[0][0]).toEqual({
                event: 'item some new data - false is removed',
                viewState: vs2,
                coordinate: ['comp1']
            })
        })

        it('should support component APIs', () => {
            let {childCompRef} = setup();

            childCompRef._doneClick();

            expect(childCompRef.getItemSummary()).toBe('item some data - Done: true - mounted: true')
        })
    })

    describe('dynamic conditional component', () => {

        const vs = {text: 'some data', shown: true}
        const vs2 = {text: 'some data', shown: false}
        const vs3 = {text: 'some new data', shown: true}

        beforeEach(() => {
            clearInstances();
        })

        function setup() {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let bridgeElement = mkBridgeElement(vs, () => [
                c(vs => vs.shown, [
                    childComp(Item, vs => ({text: vs.text, dataId: 'a'}), compRef('comp1'))
                ])
            ], [], [], endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement}
        }

        it('should create the component as mounted', () => {
            setup();
            let instance = componentInstance('a');

            expect(instance.getItemSummary()).toBe('item some data - Done: false - mounted: true')
        })

        it('should unmount the component if under false condition', () => {
            let {bridgeElement} = setup();
            let instance = componentInstance('a');

            bridgeElement.update(vs2)

            expect(instance.getItemSummary()).toBe('item some data - Done: false - mounted: false')
        })

        it('should re-mount the component if under true condition', () => {
            let {bridgeElement} = setup();
            let instance = componentInstance('a');

            bridgeElement.update(vs2)
            bridgeElement.update(vs3)

            expect(instance.getItemSummary()).toBe('item some new data - Done: false - mounted: true')
        })
    })

    describe('dynamic forEach components', () => {

        const A = {text: 'some data', dataId: 'a'}
        const A2 = {text: 'some new data', dataId: 'a'}
        const B = {text: 'B data', dataId: 'b'}
        const C = {text: 'C data', dataId: 'c'}
        const D = {text: 'D data', dataId: 'd'}

        const vs = {items: [A, B, C]}
        const vs2 = {items: [A2, C, D]}
        const empty = {items: []}
        type ItemType = typeof A
        type ViewStateType = typeof vs

        beforeEach(() => {
            clearInstances();
        })

        function setup(viewState = vs) {
            let endpoint = mkEndpoint();
            let reactive = new Reactive();
            let bridgeElement = mkBridgeElement(viewState, () => {
                const refComp1 = compCollectionRef('comp1');
                return [
                    forEach<ViewStateType, ItemType>(vs => vs.items, "dataId",
                        () => [childComp(Item, vs => vs, refComp1())]
                    )
                ]}, [], ['comp1'], endpoint, reactive, getNullComponentInstance, [])
            return {endpoint, bridgeElement}
        }

        it('should create the components with the provided props', () => {
            setup();

            expect(componentInstance(A.dataId).getItemSummary()).toBe('item some data - Done: false - mounted: true')
            expect(componentInstance(B.dataId).getItemSummary()).toBe('item B data - Done: false - mounted: true')
            expect(componentInstance(C.dataId).getItemSummary()).toBe('item C data - Done: false - mounted: true')
        })

        it('should update the components with the new instances and props, unmounting removed components', () => {
            let {bridgeElement} = setup();
            bridgeElement.update(vs2)

            expect(componentInstance(A.dataId).getItemSummary()).toBe('item some new data - Done: false - mounted: true')
            expect(componentInstance(B.dataId).getItemSummary()).toBe('item B data - Done: false - mounted: false')
            expect(componentInstance(C.dataId).getItemSummary()).toBe('item C data - Done: false - mounted: true')
            expect(componentInstance(D.dataId).getItemSummary()).toBe('item D data - Done: false - mounted: true')
        })

        it('should register and invoke events on the components', () => {
            let {bridgeElement} = setup();
            let callback = jest.fn();

            (bridgeElement.refs.comp1 as ComponentCollectionProxy<ItemType, ReturnType<typeof Item>>).addEventListener('remove', callback)
            componentInstance(B.dataId)._removeClick();
            componentInstance(C.dataId)._removeClick();

            expect(callback.mock.calls.length).toBe(2)
            expect(callback.mock.calls[0][0]).toEqual({
                event: 'item B data - false is removed',
                viewState: B,
                coordinate: ['b', 'comp1']
            })
            expect(callback.mock.calls[1][0]).toEqual({
                event: 'item C data - false is removed',
                viewState: C,
                coordinate: ['c', 'comp1']
            })
        })

        it('should register events on empty collection', () => {
            let {bridgeElement} = setup(empty);
            let callback = jest.fn();

            (bridgeElement.refs.comp1 as ComponentCollectionProxy<ItemType, ReturnType<typeof Item>>).addEventListener('remove', callback)
            bridgeElement.update(vs)
            componentInstance(A.dataId)._removeClick();
            componentInstance(C.dataId)._removeClick();

            expect(callback.mock.calls.length).toBe(2)
            expect(callback.mock.calls[0][0]).toEqual({
                event: 'item some data - false is removed',
                viewState: A,
                coordinate: ['a', 'comp1']
            })
            expect(callback.mock.calls[1][0]).toEqual({
                event: 'item C data - false is removed',
                viewState: C,
                coordinate: ['c', 'comp1']
            })
        })

        it('should support component APIs', () => {
            setup();
            let Binstance = componentInstance(B.dataId);

            Binstance._doneClick();

            expect(Binstance.getItemSummary()).toBe('item B data - Done: true - mounted: true')
        })

        it('should support find component', () => {
            let {bridgeElement} = setup();
            let callback = jest.fn(item => item === B);

            let foundComp = (bridgeElement.refs.comp1 as ComponentCollectionProxy<ItemType, ReturnType<typeof Item>>).find(callback)

            expect(foundComp.getItemSummary()).toBe("item B data - Done: false - mounted: true")
        })

        it('should support map components', () => {
            let {bridgeElement} = setup();

            let mapResult = (bridgeElement.refs.comp1 as ComponentCollectionProxy<ItemType, ReturnType<typeof Item>>)
                .map((comp, viewState, coordinate) => {
                    return `comp.getItemSummary(): ${comp.getItemSummary()}\nviewState: ${JSON.stringify(viewState)}\ncoordinate: [${coordinate}]`
                })

            expect(mapResult).toContain(`comp.getItemSummary(): item some data - Done: false - mounted: true
viewState: ${JSON.stringify(A)}
coordinate: [a,comp1]`)
            expect(mapResult).toContain(`comp.getItemSummary(): item B data - Done: false - mounted: true
viewState: ${JSON.stringify(B)}
coordinate: [b,comp1]`)
            expect(mapResult).toContain(`comp.getItemSummary(): item C data - Done: false - mounted: true
viewState: ${JSON.stringify(C)}
coordinate: [c,comp1]`)
        })
    })
})

interface TestJayEndpoint extends IJayEndpoint {
    readonly outMessages: (JPMAddEventListener | JPMNativeExec)[]
    invoke(inMessage: JPMDomEvent | JPMNativeExecResult)
}

function mkEndpoint(): TestJayEndpoint {
    let _compId = 1;
    let _outMessages = [];
    let _handler;

    let port: IJayPort = {
        batch<T>(handler: () => T): T {
            return undefined;
        },
        flush() {
        },
        getEndpoint(parentCompId: number, parentCoordinate: Coordinate): IJayEndpoint {
            return undefined;
        },
        getRootEndpoint(): IJayEndpoint {
            return undefined;
        }
    }

    return {
        get port() {
            return port;
        },
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
        invoke(inMessage: JPMDomEvent | JPMNativeExecResult) {
            _handler(inMessage)
        }
    }
}
