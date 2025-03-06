import {JayElement} from "jay-runtime";
import {ConcreteJayComponent, ContextMarkers, JayComponentCore} from "jay-component";
import {ComponentDeclaration, PartialSubtract} from "./jay-stack-types";

export function makeJayStackComponent<
    PropsT extends object,
    ViewState extends object,
    StaticViewState extends Partial<ViewState>,
    DynamicViewState extends PartialSubtract<ViewState, StaticViewState>,
    Refs extends object,
    SlowlyCarryForward extends object,
    FastCarryForward extends object,
    JayElementT extends JayElement<DynamicViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, DynamicViewState>,
>(
    compDeclaration: ComponentDeclaration<PropsT, ViewState, StaticViewState, DynamicViewState,
        Refs, SlowlyCarryForward, FastCarryForward,
        JayElementT, ServerContexts, ClientContexts, CompCore>,
    serverContextMarkers: ContextMarkers<ServerContexts>,
    clientContextMarkers: ContextMarkers<ClientContexts>
): (props: PropsT) => ConcreteJayComponent<PropsT, DynamicViewState, Refs, CompCore, JayElementT> {
    return null;
}
