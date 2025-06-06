import { AnyJayStackComponentDefinition } from 'jay-fullstack-component';

export interface CompositePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
}