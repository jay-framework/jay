import {
    JayElement,
    JayEvent,
    JayEventHandler,
    JayNativeFunction,
    provideContext,
    RenderElement,
    useContext
} from "jay-runtime";
import {createState, JayComponentCore, makeJayComponent, Props, useReactive} from "jay-component";
import {IJayEndpoint, JPMMessage} from "../comm-channel/comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";
import {SECURE_COORDINATE_MARKER} from "./main-child-comp";
import {FunctionsRepository} from "./function-repository-types";
import {
    addEventListenerMessage,
    eventInvocationMessage,
    JayPortMessageType, nativeExecResult,
    rootApiInvoke
} from "../comm-channel/messages";
import {deserialize, Deserialize} from "jay-reactive";

interface CompBridgeOptions {
    events?: Array<string>,
    functions?: Array<string>,
    funcRepository?: FunctionsRepository
}

interface MainComponentBridge {
    invokeAPI: (functionName: string, args: any[]) => Promise<any>
    registerEvent: (eventType: string, handler: Function) => void
}

type PromiseResolve = (result: any | PromiseLike<any>) => void
type PromiseReject = (reason?: any) => void


function makeComponentBridgeConstructor<
    PropsT extends object,
    Refs extends object,
    ViewState extends object>
(props: Props<PropsT>, refs: Refs): JayComponentCore<PropsT, ViewState> & MainComponentBridge {

    let [viewState, setViewState] = createState<ViewState>({} as ViewState);
    let reactive = useReactive();
    let {endpoint, port, funcRepository} = useContext(SECURE_COMPONENT_MARKER);

    let ongoingAPICalls: Record<number, [PromiseResolve, PromiseReject]> = {};
    let eventHandlers: Record<string, JayEventHandler<any, any, any>> = {}

    let deserializedViewState: ViewState, nextDeserialize: Deserialize<ViewState> = deserialize

    endpoint.onUpdate( (message: JPMMessage) => {
        switch (message.type) {
            case JayPortMessageType.render:
                reactive.batchReactions(() => {
                    [deserializedViewState, nextDeserialize] = nextDeserialize(message.viewState);
                    setViewState(deserializedViewState)
                });
                break;
            case JayPortMessageType.addEventListener: {
                let {eventType, nativeId} = message;
                refs[message.refName].addEventListener(eventType, (event: JayEvent<any, any>) => {
                    port.batch(() => {
                        if (message.nativeId) {
                            let eventData = (funcRepository[nativeId] as JayEventHandler<any, any, any>)(event);
                            endpoint.post(eventInvocationMessage(eventType, event.coordinate, eventData))
                        }
                        else
                            endpoint.post(eventInvocationMessage(eventType, event.coordinate))
                    })
                })}
                break;
            case JayPortMessageType.rootApiReturns:
                let {callId, error, returns} = message;
                if (ongoingAPICalls[callId]) {
                    if (error)
                        ongoingAPICalls[callId][1](error)
                    else
                        ongoingAPICalls[callId][0](returns)
                    delete ongoingAPICalls[callId]
                }
                break;
            case JayPortMessageType.eventInvocation: {
                let {eventType, eventData} = message;
                eventHandlers[eventType]({event: eventData, coordinate: [''], viewState: null})
                break;
            }
            case JayPortMessageType.nativeExec: {
                let {nativeId, refName, coordinate, correlationId} = message;
                let ref = refs[refName]
                port.batch(async () => {
                    try {
                        let result = await ref.$exec((elem, vs) =>
                                (funcRepository[nativeId] as JayNativeFunction<any, any, any>)(elem, vs));
                        endpoint.post(nativeExecResult(refName, correlationId, result))
                    }
                    catch (err) {
                        endpoint.post(nativeExecResult(refName, correlationId, undefined, err.message))
                    }
                });
            }
        }
    })

    let nextCallId = 0;
    let invokeAPI = (functionName: string, args: any[]) => {
        let callId = nextCallId++;
        port.batch(() => {
            endpoint.post(rootApiInvoke(functionName, callId, args))
        })
        return new Promise((resolve, reject) => {
            ongoingAPICalls[callId] = [resolve, reject]
        });
    }
    let registerEvent = (eventType: string, handler: JayEventHandler<any, any, any>) => {
        eventHandlers[eventType] = handler;
        port.batch(() => {
            endpoint.post(addEventListenerMessage('', eventType))
        })
    }
    return {
        render: viewState,
        invokeAPI,
        registerEvent
    }
}

function defineCompPublicAPI(comp: MainComponentBridge, endpoint: IJayEndpoint, options: CompBridgeOptions) {
    if (options?.events)
        comp['addEventListener'] = (eventType: string, handler: Function) => comp.registerEvent(eventType, handler);

    options?.functions?.forEach(functionName => {
        comp[functionName] = (...args) => {
            return comp.invokeAPI(functionName, args)
        }
    })
}

export function makeJayComponentBridge<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>>
(render: RenderElement<ViewState, Refs, JayElementT>,
 options?: CompBridgeOptions) {
    let component = makeJayComponent(render, makeComponentBridgeConstructor);
    return (props: PropsT) => {
        let {compId, port} = useContext(SECURE_COMPONENT_MARKER);
        let {coordinate} = useContext(SECURE_COORDINATE_MARKER);
        let endpoint = port.getEndpoint(compId, coordinate);
        let newSecureComponentContext = {endpoint, compId: endpoint.compId, port, funcRepository: options?.funcRepository}
        return provideContext(SECURE_COMPONENT_MARKER, newSecureComponentContext, () => {
            let comp = component(props);
            defineCompPublicAPI(comp as unknown as MainComponentBridge, endpoint, options);
            return comp;
        })
    }
}