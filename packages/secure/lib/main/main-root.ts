import {BaseJayElement, provideContext} from "jay-runtime";
import {rootComponentViewState, useMainPort} from "../comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";


export function mainRoot<ViewState>(viewState: ViewState, elementConstructor: () => BaseJayElement<ViewState>): BaseJayElement<ViewState> {
    let port = useMainPort();
    let endpoint = port.getRootEndpoint();
    let context = {compId: 0, endpoint, port}

    return provideContext(SECURE_COMPONENT_MARKER, context, () => {
        let element = port.batch(() => {
            endpoint.post(rootComponentViewState(viewState))
            return elementConstructor();
        })
        return {
            dom: element.dom,
            mount: element.mount,
            unmount: element.unmount,
            update: (newData: ViewState) => {
                element.update(newData);
                endpoint.post(rootComponentViewState(newData))
            }
        }
    })

}