import {JayComponent, JayElement, JayEvent, provideContext, RenderElement, useContext} from "jay-runtime";
import {createState, JayComponentCore, makeJayComponent, Props, useReactive} from "jay-component";
import {
    domEventMessage, JayEndpoint,
    JayPortMessageType,
    JPMMessage
} from "../comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";
import {SECURE_COORDINATE_MARKER} from "./main-child-comp";
import {FunctionsRepository} from "./function-repository-types";

interface CompBridgeOptions {
    events?: Array<string>,
    functions?: Array<string>,
    funcRepository?: FunctionsRepository
}

function makeComponentBridgeConstructor<
    PropsT extends object,
    Refs extends object,
    ViewState extends object>
(props: Props<PropsT>, refs: Refs): JayComponentCore<PropsT, ViewState> {

    let [viewState, setViewState] = createState<ViewState>({} as ViewState);
    let reactive = useReactive();
    let {endpoint, port, funcRepository} = useContext(SECURE_COMPONENT_MARKER);

    endpoint.onUpdate((message: JPMMessage) => {
        switch (message.type) {
            case JayPortMessageType.render:
                reactive.batchReactions(() => setViewState(message.viewState));
                break;
            case JayPortMessageType.addEventListener:
                refs[message.refName].addEventListener(message.eventType, (event: JayEvent<any, any>) => {
                    port.batch(() => {
                        if (message.nativeId) {
                            let eventData = funcRepository[message.nativeId](event);
                            endpoint.post(domEventMessage(message.eventType, event.coordinate, eventData))
                        }
                        else
                            endpoint.post(domEventMessage(message.eventType, event.coordinate))
                    })
                })
                break;
        }
    })
    return {
        render: viewState
    }
}

function makeCompAPIProxy(comp: object, endpoint: JayEndpoint, options: CompBridgeOptions) {
    if (options?.events)
        comp['addEventListener'] = (eventType: string, handler: Function) => console.log('event api', eventType, handler);

    options?.functions?.forEach(functionName => {
        comp[functionName] = (...args) => console.log('comp api', args);
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
            makeCompAPIProxy(comp, endpoint, options);
            return comp;
        })
    }
}