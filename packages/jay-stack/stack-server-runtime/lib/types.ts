import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';

/**
 * Shared types used by both runtime (serve) and build (dev-server) code.
 * Defined here so the runtime package doesn't need compiler imports.
 */

export type Coordinate = string[];

export interface DevServerPagePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
    /**
     * Module the keyed part's component is loaded from — its stable, global component identity
     * (DL#221 post-merge fix). Used to key the build-time `loadParams` cache so two routes that reuse
     * the same page-local ref `key` for different components don't collide. Absent for the page's own
     * part (which is keyed per route instead).
     */
    modulePath?: string;
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
    /**
     * Coordinate of the nearest enclosing headless instance (DL#196). A nested instance's
     * prop bindings resolve against this enclosing instance's resolved ViewState rather than
     * the page ViewState. `undefined` for top-level instances (enclosing scope is the page).
     */
    parentCoordinate?: Coordinate;
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
