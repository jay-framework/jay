import { AnyJayStackComponentDefinition } from './jay-stack-types';

export interface CompositePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
}

export const MAIN_PART = '__MAIN__';

export function readPart(compositePart: CompositePart): [AnyJayStackComponentDefinition, string] {
    return [compositePart.compDefinition, compositePart.key || MAIN_PART];
}
