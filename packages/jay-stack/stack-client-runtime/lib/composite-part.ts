import {ComponentConstructor, ContextMarkers} from "jay-component";

export interface CompositePart {
    comp: ComponentConstructor<any, any, any, any, any>,
    contextMarkers: ContextMarkers<any>;
    key?: string;
}
