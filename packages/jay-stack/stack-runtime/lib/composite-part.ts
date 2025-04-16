import {AnyJayStackComponentDefinition} from "./jay-stack-types";

export interface CompositePart {
    compDefinition: AnyJayStackComponentDefinition;
    viewStateKey?: string;
    mainPart?: boolean
}