import {JayComponent} from "jay-runtime";
import {JayPort, JPMRoot, ROOT_MESSAGE, usePort} from "./comm-channel";

export function workerRoot<PropsT extends object>(compConstructor: (PropsT) => JayComponent<PropsT, any, any>) {
    let comp;
    let port: JayPort = usePort();
    port.onUpdate((inMessage: JPMRoot)  => {
        let newProps = inMessage.props;
        port.batch(() => {
            if (!comp)
                comp = compConstructor(newProps)
            else
                comp.update(newProps);
        })
    })
}