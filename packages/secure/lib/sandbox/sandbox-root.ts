import {JayComponent, JayComponentConstructor, provideContext} from "jay-runtime";
import {JayPort, JPMRootComponentProps, useWorkerPort} from "../comm-channel";
import {SANDBOX_MARKER} from "./sandbox-context";

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

export function sandboxRoot(comps: Array<WorkerChildComp<any, any>>) {
    let port: JayPort = useWorkerPort();
    let endpoint = port.getRootEndpoint();
    endpoint.onUpdate((inMessage: JPMRootComponentProps)  => {
        let viewState = inMessage.viewState;
        comps.forEach(workerChildComp => {
            if (!workerChildComp.comp) {
                let context = {port, endpoint, compId: 0, coordinate: workerChildComp.refName}
                workerChildComp.comp = provideContext(SANDBOX_MARKER, context, () => {
                    return workerChildComp.compCreator(workerChildComp.getProps(viewState))
                })
            }
            else
                workerChildComp.comp.update(workerChildComp.getProps(viewState));
        })
    })
}