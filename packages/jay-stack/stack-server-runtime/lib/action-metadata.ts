/**
 * Action metadata loaded from .jay-action files.
 *
 * .jay-action files describe an action's input/output schema and purpose.
 * They serve as the single source of truth for:
 * - AI agent tool definitions (Gemini function declarations)
 * - TypeScript type generation (.jay-action.d.ts)
 * - Agent-kit materialization for coding agents
 *
 * Actions without .jay-action files are not exposed to AI agents.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { getLogger } from '@jay-framework/logger';

/**
 * JSON Schema-like type definition used in .jay-action files.
 * Supports object, array, string, number, boolean, and nested schemas.
 */
export interface JsonSchemaProperty {
    type: string;
    description?: string;
    default?: unknown;
    enum?: string[];
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
}

/**
 * Input/output schema for an action (JSON Schema object type).
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
 * Raw parsed YAML structure from a .jay-action file.
 */
interface ParsedActionYaml {
    name?: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
}

/**
 * Parses a .jay-action YAML string into ActionMetadata.
 *
 * @param yamlContent - Raw YAML string
 * @param fileName - File name for error messages
 * @returns Parsed ActionMetadata or null if invalid
 */
export function parseActionMetadata(yamlContent: string, fileName: string): ActionMetadata | null {
    try {
        const parsed = YAML.parse(yamlContent) as ParsedActionYaml;

        if (!parsed || typeof parsed !== 'object') {
            getLogger().warn(`[ActionMetadata] ${fileName}: empty or invalid YAML`);
            return null;
        }

        if (!parsed.name || typeof parsed.name !== 'string') {
            getLogger().warn(`[ActionMetadata] ${fileName}: missing or invalid 'name' field`);
            return null;
        }

        if (!parsed.description || typeof parsed.description !== 'string') {
            getLogger().warn(
                `[ActionMetadata] ${fileName}: missing or invalid 'description' field`,
            );
            return null;
        }

        if (!parsed.inputSchema || typeof parsed.inputSchema !== 'object') {
            getLogger().warn(
                `[ActionMetadata] ${fileName}: missing or invalid 'inputSchema' field`,
            );
            return null;
        }

        const inputSchema = parsed.inputSchema as ActionSchema;
        if (inputSchema.type !== 'object' || !inputSchema.properties) {
            getLogger().warn(
                `[ActionMetadata] ${fileName}: inputSchema must have type 'object' and 'properties'`,
            );
            return null;
        }

        const metadata: ActionMetadata = {
            name: parsed.name,
            description: parsed.description,
            inputSchema,
        };

        if (parsed.outputSchema && typeof parsed.outputSchema === 'object') {
            metadata.outputSchema = parsed.outputSchema as JsonSchemaProperty;
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
 *
 * @param filePath - Absolute path to the .jay-action file
 * @returns Parsed ActionMetadata or null if file not found or invalid
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
 *
 * @param actionPath - Relative path from plugin.yaml (e.g., "./actions/send-message.jay-action")
 * @param pluginDir - Absolute path to the plugin directory
 * @returns Absolute path to the .jay-action file
 */
export function resolveActionMetadataPath(actionPath: string, pluginDir: string): string {
    return path.resolve(pluginDir, actionPath);
}
