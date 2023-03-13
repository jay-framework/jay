import {BaseJayElement, provideContext} from "jay-runtime";
import {ROOT_MESSAGE, rootComponentProps, useMainPort} from "./comm-channel";
import {SECURE_COMPONENT_MARKER} from "./component-contexts";


export function ComponentRoot<ViewState>(elementConstructor: () => BaseJayElement<ViewState>): BaseJayElement<ViewState> {
    let port = useMainPort();
    let endpoint = port.getRootEndpoint();
    let context = {compId: 0, endpoint, port}

    return provideContext(SECURE_COMPONENT_MARKER, context, () => {
        let element = elementConstructor();
        return {
            dom: element.dom,
            mount: element.mount,
            unmount: element.unmount,
            update: (newData: ViewState) => {
                element.update(newData);
                endpoint.post(rootComponentProps(newData))
            }
        }
    })

}