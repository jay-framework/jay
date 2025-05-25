import { AnyJayStackComponentDefinition } from './jay-stack-types';

export interface CompositePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
}