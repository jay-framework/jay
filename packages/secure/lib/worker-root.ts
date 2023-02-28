import {JayComponent, JayComponentConstructor} from "jay-runtime";
import {JayPort, JPMRootComponentProps, useWorkerPort} from "./comm-channel";

interface WorkerChildComp<ParentVS extends object, PropsT extends object> {
    refName: string
    compCreator: (PropsT) => JayComponent<PropsT, any, any>
    getProps: (t: ParentVS) => PropsT
    comp?
}

export function childComp<
    ParentVS extends object,
    PropsT extends object>(
    compCreator: JayComponentConstructor<PropsT>,
    getProps: (t: ParentVS) => PropsT,
    refName?: string):
    WorkerChildComp<ParentVS, PropsT>{
    return {refName, compCreator, getProps}
}

export function workerRoot(comps: Array<WorkerChildComp<any, any>>) {
    let port: JayPort = useWorkerPort();
    let ep = port.getRootEndpoint();
    ep.onUpdate((inMessage: JPMRootComponentProps)  => {
        let newProps = inMessage.props;
        comps.forEach(workerChildComp => {
            if (!workerChildComp.comp)
                workerChildComp.comp = workerChildComp.compCreator(workerChildComp.getProps(newProps))
            else
                workerChildComp.comp.update(newProps);
        })
    })
}