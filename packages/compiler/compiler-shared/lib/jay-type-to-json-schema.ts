/**
 * Converts JayType trees to JSON Schema.
 *
 * Used by the runtime to convert parsed .jay-action files into JSON Schema
 * for AI agent tool definitions (e.g., Gemini function declarations).
 */

import {
    JayType,
    isAtomicType,
    isEnumType,
    isObjectType,
    isArrayType,
    isImportedType,
    isOptionalType,
} from './jay-type';

/**
 * JSON Schema property definition.
 */
export interface JsonSchemaProperty {
    type: string;
    description?: string;
    enum?: string[];
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
}

/**
 * Converts a JayType to a JSON Schema property.
 */
export function jayTypeToJsonSchema(type: JayType): JsonSchemaProperty | null {
    if (isOptionalType(type)) {
        return jayTypeToJsonSchema(type.innerType);
    }

    if (isAtomicType(type)) {
        const name = type.name.toLowerCase();
        if (name === 'string' || name === 'number' || name === 'boolean') {
            return { type: name };
        }
        // Unknown atomic (e.g., Date) — fall back to string
        return { type: 'string' };
    }

    if (isEnumType(type)) {
        return { type: 'string', enum: type.values };
    }

    if (isImportedType(type)) {
        // Contract reference — we don't have the full schema at this level,
        // so emit a generic object with a description hint
        return { type: 'object', description: `Contract: ${type.name}` };
    }

    if (isArrayType(type)) {
        const itemSchema = jayTypeToJsonSchema(type.itemType);
        if (itemSchema) {
            return { type: 'array', items: itemSchema };
        }
        return { type: 'array' };
    }

    if (isObjectType(type)) {
        const properties: Record<string, JsonSchemaProperty> = {};
        const required: string[] = [];

        for (const [key, propType] of Object.entries(type.props)) {
            const isOpt = isOptionalType(propType);
            const schema = jayTypeToJsonSchema(propType);
            if (schema) {
                properties[key] = schema;
                if (!isOpt) {
                    required.push(key);
                }
            }
        }

        return {
            type: 'object',
            properties,
            ...(required.length > 0 && { required }),
        };
    }

    return null;
}
