import {
    BaseJayElement,
    childComp,
    createJayContext,
    JayComponent,
    JayComponentConstructor,
    provideContext
} from "jay-runtime";
import {currentConstructionContext} from "jay-runtime/dist/context";

export interface SecureCoordinateContext {
    coordinate: string
}
export const SECURE_COORDINATE_MARKER = createJayContext<SecureCoordinateContext>()

export function secureChildComp<ParentVS, Props, ChildT,
    ChildElement extends BaseJayElement<ChildT>, ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentVS) => Props,
    refName: string): BaseJayElement<ParentVS> {
    let constructContext = currentConstructionContext();
    let coordinate = constructContext.coordinate(refName)

    return provideContext(SECURE_COORDINATE_MARKER, {coordinate}, () => {
        return childComp(compCreator, getProps, refName)
    })
}