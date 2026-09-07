import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';

/**
 * Shared types used by both runtime (serve) and build (dev-server) code.
 * Defined here so the runtime package doesn't need compiler imports.
 */

export type Coordinate = string[];

export interface DevServerPagePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
    clientImport: string;
    clientPart: string;
    contractInfo?: {
        contractName: string;
        metadata?: Record<string, unknown>;
    };
    headlessProps?: Record<string, string>;
}

export interface HeadlessInstanceComponent {
    contractName: string;
    compDefinition: AnyJayStackComponentDefinition;
    contract: RuntimeContract;
}

/**
 * Minimal contract shape needed at serve time.
 * The full Contract type lives in compiler-jay-html.
 */
export interface RuntimeContract {
    name?: string;
    props?: Array<{ name: string; [key: string]: any }>;
    params?: Array<{ name: string; kind: string }>;
    tags?: Array<{ tag: string; [key: string]: any }>;
}

export interface DiscoveredHeadlessInstance {
    contractName: string;
    props: Record<string, string>;
    coordinate: Coordinate;
}

export interface ForEachHeadlessInstance {
    contractName: string;
    forEachPath: string;
    trackBy: string;
    propBindings: Record<string, string>;
    coordinateSuffix: string;
}

export interface JsonSchemaProperty {
    type?: string | string[];
    description?: string;
    enum?: string[];
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    [key: string]: any;
}

export interface ActionSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
}

export interface ActionMetadata {
    name: string;
    description: string;
    inputSchema: ActionSchema;
    outputSchema?: JsonSchemaProperty;
}

export interface ViteSSRLoader {
    ssrLoadModule: (url: string) => Promise<Record<string, any>>;
}

export function computeForEachInstanceKey(trackByValue: string, coordinateSuffix: string): string {
    return [trackByValue, coordinateSuffix].toString();
}
