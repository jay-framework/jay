/**
 * Parser for .jay-action files.
 *
 * Parses YAML into an ActionDefinition structure that can be compiled
 * to TypeScript .d.ts files.
 */

import yaml from 'js-yaml';
import { WithValidations } from '@jay-framework/compiler-shared';
import { pascalCase } from 'change-case';

/**
 * JSON Schema property definition as used in .jay-action files.
 */
export interface ActionSchemaProperty {
    type: string;
    description?: string;
    default?: unknown;
    enum?: string[];
    items?: ActionSchemaProperty;
    properties?: Record<string, ActionSchemaProperty>;
    required?: string[];
}

/**
 * Parsed action definition from a .jay-action file.
 */
export interface ActionDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, ActionSchemaProperty>;
        required?: string[];
    };
    outputSchema?: ActionSchemaProperty;
}

interface ParsedActionYaml {
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
    outputSchema?: unknown;
}

/**
 * Parses a .jay-action YAML string into an ActionDefinition.
 *
 * @param actionYaml - Raw YAML content
 * @param fileName - File name for error messages
 * @returns Parsed ActionDefinition with validation messages
 */
export function parseAction(
    actionYaml: string,
    fileName: string,
): WithValidations<ActionDefinition> {
    try {
        const parsed = yaml.load(actionYaml) as ParsedActionYaml;
        const validations: string[] = [];

        if (!parsed || typeof parsed !== 'object') {
            return new WithValidations(undefined, [
                'Action file is empty or not a valid YAML object',
            ]);
        }

        if (!parsed.name || typeof parsed.name !== 'string') {
            validations.push(`Action must have a 'name' field (string)`);
        }

        if (!parsed.description || typeof parsed.description !== 'string') {
            validations.push(`Action must have a 'description' field (string)`);
        }

        if (!parsed.inputSchema || typeof parsed.inputSchema !== 'object') {
            validations.push(`Action must have an 'inputSchema' field (object)`);
        } else {
            const schema = parsed.inputSchema as Record<string, unknown>;
            if (schema.type !== 'object') {
                validations.push(`inputSchema.type must be 'object'`);
            }
            if (!schema.properties || typeof schema.properties !== 'object') {
                validations.push(`inputSchema must have 'properties' (object)`);
            }
        }

        if (validations.length > 0) {
            return new WithValidations(undefined, validations);
        }

        const definition: ActionDefinition = {
            name: parsed.name as string,
            description: parsed.description as string,
            inputSchema: parsed.inputSchema as ActionDefinition['inputSchema'],
        };

        if (parsed.outputSchema && typeof parsed.outputSchema === 'object') {
            definition.outputSchema = parsed.outputSchema as ActionSchemaProperty;
        }

        return new WithValidations(definition, []);
    } catch (e: any) {
        throw new Error(`Failed to parse action YAML for ${fileName}: ${e.message}`);
    }
}
