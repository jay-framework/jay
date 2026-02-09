import { ComponentConstructor, ContextMarkers } from '@jay-framework/component';

export interface CompositePart {
    /**
     * The interactive component constructor.
     * May be undefined if the component has no interactive phase (only slow/fast phases).
     * See Design Log #72.
     */
    comp?: ComponentConstructor<any, any, any, any, any>;
    contextMarkers: ContextMarkers<any>;
    key?: string;
}
