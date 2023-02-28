import {BaseJayElement} from "jay-runtime";
import {ROOT_MESSAGE, rootComponentProps, useMainPort} from "./comm-channel";


export function ComponentRoot<ViewState>(element: BaseJayElement<ViewState>): BaseJayElement<ViewState> {
    return {
        dom: element.dom,
        mount: element.mount,
        unmount: element.unmount,
        update: (newData: ViewState) => {
            element.update(newData);
            let port = useMainPort();
            let ep = port.getRootEndpoint();
            ep.post(rootComponentProps(newData))
        }
    }
}