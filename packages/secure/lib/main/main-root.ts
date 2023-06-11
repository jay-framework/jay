import {BaseJayElement, provideContext} from "jay-runtime";
import {useMainPort} from "../comm-channel/comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";
import {rootComponentViewState} from "../comm-channel/messages";
import {serialize} from 'jay-reactive'


export function mainRoot<ViewState>(viewState: ViewState, elementConstructor: () => BaseJayElement<ViewState>): BaseJayElement<ViewState> {
    let port = useMainPort();
    let endpoint = port.getRootEndpoint();
    let context = {compId: endpoint.compId, endpoint, port}

    return provideContext(SECURE_COMPONENT_MARKER, context, () => {
        let serialized: string, nextSerialize;
        let element = port.batch(() => {
            [serialized, nextSerialize] = serialize(viewState);
            endpoint.post(rootComponentViewState(serialized))
            return elementConstructor();
        })
        return {
            dom: element.dom,
            mount: element.mount,
            unmount: element.unmount,
            update: (newData: ViewState) => {
                element.update(newData);
                port.batch(() => {
                    [serialized, nextSerialize] = nextSerialize(newData);
                    endpoint.post(rootComponentViewState(serialized))
                })
            }
        }
    })

}