import { Getter, Reactive, Setter } from '@jay-framework/reactive';
import { ContextMarker, createJayContext, JayComponent, MountFunc } from '@jay-framework/runtime';

export interface HookContext {
    reactive: Reactive;
    mountedSignal: [Getter<boolean>, Setter<boolean>];
    provideContexts: [ContextMarker<any>, any][];
}
export interface ComponentContext extends HookContext {
    reactive: Reactive;
    getComponentInstance: () => JayComponent<any, any, any>;
    mountedSignal: [Getter<boolean>, Setter<boolean>];
}

export const COMPONENT_CONTEXT = createJayContext<ComponentContext>();
export const CONTEXT_CREATION_CONTEXT = createJayContext<HookContext>();
