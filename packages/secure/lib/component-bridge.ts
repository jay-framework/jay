import {JayElement, RenderElement} from "jay-runtime";
import {createState, JayComponentCore, makeJayComponent, Props, useReactive} from "jay-component";
import {ROOT_MESSAGE, usePort} from "./comm-channel";

function makeComponentBridgeConstructor<
    PropsT extends object,
    Refs extends object,
    ViewState extends object>
(props: Props<PropsT>, refs: Refs): JayComponentCore<PropsT, ViewState> {

    let [viewState, setViewState] = createState<ViewState>({} as ViewState);
    let port = usePort();

    port.post(ROOT_MESSAGE, props.props())
    port.flush()
    port.onUpdate(message => {
        useReactive().batchReactions(() => setViewState(message['a']))
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