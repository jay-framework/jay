/**
 * Action metadata loaded from .jay-action files.
 *
 * Uses the compiler's parseAction to parse .jay-action YAML into JayType,
 * then converts JayType → JSON Schema for consumers (AI agent tool builders).
 *
 * Actions without .jay-action files are not exposed to AI agents.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '@jay-framework/logger';
import { parseAction } from '@jay-framework/compiler-jay-html';
import {
    type JsonSchemaProperty,
    jayTypeToJsonSchema,
    isObjectType,
} from '@jay-framework/compiler-shared';

// Re-export JsonSchemaProperty for consumers
export type { JsonSchemaProperty };

/**
 * Input schema for an action (JSON Schema object type).
 */
export interface ActionSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
}

/**
 * Metadata loaded from a .jay-action file.
 */
export interface ActionMetadata {
    /** Action name (must match the export name in plugin code) */
    name: string;
    /** Human-readable description of what the action does */
    description: string;
    /** JSON Schema for the action's input parameters */
    inputSchema: ActionSchema;
    /** JSON Schema for the action's output (optional) */
    outputSchema?: JsonSchemaProperty;
}

/**
 * Parses a .jay-action YAML string into ActionMetadata.
 * Uses the compiler's parseAction to produce JayType, then converts to JSON Schema.
 */
export function parseActionMetadata(yamlContent: string, fileName: string): ActionMetadata | null {
    try {
        const parsed = parseAction(yamlContent, fileName);

        if (parsed.validations.length > 0) {
            getLogger().warn(
                `[ActionMetadata] ${fileName}: validation errors: ${parsed.validations.join(', ')}`,
            );
            return null;
        }

        if (!parsed.val) {
            getLogger().warn(`[ActionMetadata] ${fileName}: parsing returned no result`);
            return null;
        }

        const action = parsed.val;

        // Convert inputType (JayObjectType) → JSON Schema
        const inputJsonSchema = jayTypeToJsonSchema(action.inputType);
        let inputSchema: ActionSchema;
        if (inputJsonSchema && inputJsonSchema.type === 'object') {
            inputSchema = {
                type: 'object',
                properties: inputJsonSchema.properties || {},
                ...(inputJsonSchema.required &&
                    inputJsonSchema.required.length > 0 && { required: inputJsonSchema.required }),
            };
        } else {
            inputSchema = { type: 'object', properties: {} };
        }

        const metadata: ActionMetadata = {
            name: action.name,
            description: action.description,
            inputSchema,
        };

        // Convert outputType → JSON Schema
        if (action.outputType) {
            const outputJsonSchema = jayTypeToJsonSchema(action.outputType);
            if (outputJsonSchema) {
                metadata.outputSchema = outputJsonSchema;
            }
        }

        return metadata;
    } catch (error) {
        getLogger().error(
            `[ActionMetadata] Failed to parse ${fileName}: ${error instanceof Error ? error.message : error}`,
        );
        return null;
    }
}

/**
 * Loads action metadata from a .jay-action file on disk.
 */
export function loadActionMetadata(filePath: string): ActionMetadata | null {
    if (!fs.existsSync(filePath)) {
        getLogger().warn(`[ActionMetadata] File not found: ${filePath}`);
        return null;
    }

    const yamlContent = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    return parseActionMetadata(yamlContent, fileName);
}

/**
 * Resolves the absolute path of a .jay-action file relative to a plugin directory.
 */
export function resolveActionMetadataPath(actionPath: string, pluginDir: string): string {
    return path.resolve(pluginDir, actionPath);
}
