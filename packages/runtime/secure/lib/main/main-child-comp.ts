import {
    BaseJayElement,
    childComp,
    Coordinate,
    createJayContext,
    JayComponent,
    JayComponentConstructor,
    withContext,
} from '@jay-framework/runtime';
import { currentConstructionContext, PrivateRef } from '@jay-framework/runtime';

export interface SecureCoordinateContext {
    coordinate: Coordinate;
}
export const SECURE_COORDINATE_MARKER = createJayContext<SecureCoordinateContext>();

export function secureChildComp<
    ParentVS,
    Props,
    ChildT,
    ChildElement extends BaseJayElement<ChildT>,
    ChildComp extends JayComponent<Props, ChildT, ChildElement>,
>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentVS) => Props,
    ref: PrivateRef<ParentVS, ChildComp>,
): BaseJayElement<ParentVS> {
    let constructContext = currentConstructionContext();
    let coordinate = ref.coordinate;

    return withContext(SECURE_COORDINATE_MARKER, { coordinate }, () => {
        return childComp(compCreator, getProps, ref);
    });
}
