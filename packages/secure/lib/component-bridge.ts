import {JayElement, JayEvent, RenderElement} from "jay-runtime";
import {createState, JayComponentCore, makeJayComponent, Props, useReactive} from "jay-component";
import {
    domEventMessage,
    JayPortMessage,
    JayPortMessageType,
    JPMMessage,
    ROOT_MESSAGE,
    rootMessage,
    usePort
} from "./comm-channel";

function makeComponentBridgeConstructor<
    PropsT extends object,
    Refs extends object,
    ViewState extends object>
(props: Props<PropsT>, refs: Refs): JayComponentCore<PropsT, ViewState> {

    let [viewState, setViewState] = createState<ViewState>({} as ViewState);
    let port = usePort();
    let reactive = useReactive();

    port.batch(() => {
        port.post(ROOT_MESSAGE, rootMessage(props.props()))
    })
    port.onUpdate((message: JPMMessage) => {
        switch (message.type) {
            case JayPortMessageType.render:
                reactive.batchReactions(() => setViewState(message.viewState));
                break;
            case JayPortMessageType.addEventListener:
                refs[message.ref].addEventListener(message.eventType, (event: JayEvent<any, any>) => {
                    port.batch(() => {
                        port.post(ROOT_MESSAGE, domEventMessage(message.eventType, event.coordinate))
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
(render: RenderElement<ViewState, Refs, JayElementT>) {
    return makeJayComponent(render, makeComponentBridgeConstructor)
}