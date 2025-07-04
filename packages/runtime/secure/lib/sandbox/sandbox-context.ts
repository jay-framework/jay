import {
    ComponentCollectionProxy,
    Coordinate,
    createJayContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    JayComponent,
} from '@jay-framework/runtime';
import { IJayEndpoint, IJayPort } from '../comm-channel/comm-channel';
import { Reactive } from '@jay-framework/reactive';
// import { ReferencesManager } from '@jay-framework/runtime';

export interface SandboxContext {
    port: IJayPort;
    compId: number;
    coordinate: Coordinate;
}
export const SANDBOX_BRIDGE_CONTEXT = createJayContext<SandboxContext>();
export type Refs = Record<
    string,
    | HTMLElementCollectionProxy<any, any>
    | HTMLElementProxy<any, any>
    | JayComponent<any, any, any>
    | ComponentCollectionProxy<any, JayComponent<any, any, any>>
>;

export interface SandboxCreationContext<ViewState> {
    viewState: ViewState;
    endpoint: IJayEndpoint;
    // refManager?: ReferencesManager;
    dataIds: string[];
    isDynamic: boolean;
    parentComponentReactive?: Reactive;
}

export const SANDBOX_CREATION_CONTEXT = createJayContext<SandboxCreationContext<any>>();
