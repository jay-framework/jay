import {JayElement, JayEvent, provideContext, RenderElement, useContext} from "jay-runtime";
import {createState, JayComponentCore, makeJayComponent, Props, useReactive} from "jay-component";
import {
    domEventMessage,
    JayPortMessageType,
    JPMMessage
} from "../comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";
import {SECURE_COORDINATE_MARKER} from "./main-child-comp";
import {FunctionsRepository} from "./function-repository-types";

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

export function makeJayComponentBridge<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>>
(render: RenderElement<ViewState, Refs, JayElementT>,
 funcRepository?: FunctionsRepository) {
    let component = makeJayComponent(render, makeComponentBridgeConstructor);
    return (props: PropsT) => {
        let {compId, port} = useContext(SECURE_COMPONENT_MARKER);
        let {coordinate} = useContext(SECURE_COORDINATE_MARKER);
        let endpoint = port.getEndpoint(compId, coordinate);
        let newSecureComponentContext = {endpoint, compId: endpoint.compId, port, funcRepository}
        console.log('create main component ', props['id'])
        return provideContext(SECURE_COMPONENT_MARKER, newSecureComponentContext, () => {
            return component(props);
        })
    }
}