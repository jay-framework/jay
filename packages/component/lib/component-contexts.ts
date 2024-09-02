import { Reactive } from 'jay-reactive';
import { ContextMarker, createJayContext, JayComponent, MountFunc } from 'jay-runtime';

export interface HookContext {
    reactive: Reactive;
    mounts: MountFunc[];
    unmounts: MountFunc[];
    provideContexts: [ContextMarker<any>, any][];
}
export interface ComponentContext extends HookContext {
    reactive: Reactive;
    getComponentInstance: () => JayComponent<any, any, any>;
    mounts: MountFunc[];
    unmounts: MountFunc[];
}

export const COMPONENT_CONTEXT = createJayContext<ComponentContext>();
export const CONTEXT_CREATION_CONTEXT = createJayContext<HookContext>();
