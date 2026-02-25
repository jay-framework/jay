/**
 * Parser for .jay-action files (compact jay-type notation).
 *
 * Produces JayType from the compact format used by jay-html data scripts:
 * - Primitives: string, number, boolean → JayAtomicType
 * - Enums: enum(a | b | c) → JayEnumType
 * - Arrays: YAML list / type[] shorthand → JayArrayType
 * - Objects: nested YAML maps → JayObjectType (with optionalProps tracking)
 * - Optional: ? suffix on property keys → tracked in JayObjectType.optionalProps
 * - Contract imports: import: block → JayImportedType
 */

import yaml from 'js-yaml';
import {
    WithValidations,
    JayType,
    JayObjectType,
    JayArrayType,
    JayEnumType,
    JayImportedType,
    JayOptionalType,
    JayUnknown,
    resolvePrimitiveType,
} from '@jay-framework/compiler-shared';
import { parseIsEnum, parseEnumValues } from '../expressions/expression-compiler';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed action definition from a .jay-action file.
 * Uses JayType for the type representation.
 */
export interface ActionDefinition {
    name: string;
    description: string;
    /** Import aliases: alias → contract subpath (e.g., productCard → product-card.jay-contract) */
    imports: Record<string, string>;
    /** Input schema as a JayObjectType. Optional props tracked in optionalProps. */
    inputType: JayObjectType;
    /** Output type (any JayType shape, or undefined if no output). */
    outputType?: JayType;
}

// ============================================================================
// Parsing helpers
// ============================================================================

/**
 * Checks if a string value is a type[] shorthand (e.g., "string[]", "number[]").
 * Returns the base type name or null.
 */
function parseArrayShorthand(value: string): string | null {
    if (value.endsWith('[]')) {
        return value.slice(0, -2);
    }
    return null;
}

/**
 * Resolves a string value into a JayType.
 */
function resolveStringType(
    value: string,
    importAliases: Set<string>,
    path: string[],
): JayType | null {
    // Array shorthand: string[], number[], contractAlias[]
    const arrayBase = parseArrayShorthand(value);
    if (arrayBase) {
        const itemType = resolveStringType(arrayBase, importAliases, path);
        if (itemType) return new JayArrayType(itemType);
        return null;
    }

    // Nullable contract: productCard?
    if (value.endsWith('?')) {
        const alias = value.slice(0, -1);
        if (importAliases.has(alias)) {
            return new JayImportedType(alias, JayUnknown, true);
        }
        return null;
    }

    // Primitives (string, number, boolean)
    const primitive = resolvePrimitiveType(value);
    if (primitive !== JayUnknown) {
        return primitive;
    }

    // Enum: enum(a | b | c)
    if (parseIsEnum(value)) {
        const name = path.length > 0 ? path[path.length - 1] : 'value';
        return new JayEnumType(name, parseEnumValues(value));
    }

    // Contract import alias
    if (importAliases.has(value)) {
        return new JayImportedType(value, JayUnknown, false);
    }

    return null;
}

/**
 * Resolves a YAML value (string, array, or object) into a JayType.
 */
function resolveActionType(
    value: unknown,
    importAliases: Set<string>,
    path: string[],
): JayType | null {
    if (typeof value === 'string') {
        return resolveStringType(value, importAliases, path);
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        const firstItem = value[0];

        if (typeof firstItem === 'string') {
            const itemType = resolveStringType(firstItem, importAliases, [...path, 'item']);
            if (itemType) return new JayArrayType(itemType);
        } else if (typeof firstItem === 'object' && firstItem !== null) {
            const itemType = parseObjectType(firstItem as Record<string, unknown>, importAliases, [
                ...path,
                'item',
            ]);
            return new JayArrayType(itemType);
        }
        return null;
    }

    if (typeof value === 'object' && value !== null) {
        if (Object.keys(value).length === 0) {
            return new JayObjectType(path.join('.'), {});
        }
        return parseObjectType(value as Record<string, unknown>, importAliases, path);
    }

    return null;
}

/**
 * Parses a YAML object into a JayObjectType, handling ? optional markers.
 * Optional properties are wrapped in JayOptionalType.
 */
function parseObjectType(
    obj: Record<string, unknown>,
    importAliases: Set<string>,
    path: string[],
): JayObjectType {
    const props: { [key: string]: JayType } = {};

    for (const [rawKey, value] of Object.entries(obj)) {
        const isOptional = rawKey.endsWith('?');
        const name = isOptional ? rawKey.slice(0, -1) : rawKey;
        const type = resolveActionType(value, importAliases, [...path, name]);

        if (type) {
            props[name] = isOptional ? new JayOptionalType(type) : type;
        }
    }

    const typeName = path.join('.');
    return new JayObjectType(typeName, props);
}

// ============================================================================
// Main parser
// ============================================================================

interface ParsedActionYaml {
    name?: unknown;
    description?: unknown;
    import?: unknown;
    inputSchema?: unknown;
    outputSchema?: unknown;
}

/**
 * Parses a .jay-action YAML string into an ActionDefinition using JayType.
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

        if (parsed.inputSchema === undefined || parsed.inputSchema === null) {
            validations.push(`Action must have an 'inputSchema' field`);
        }

        if (validations.length > 0) {
            return new WithValidations(undefined, validations);
        }

        // Parse imports
        const imports: Record<string, string> = {};
        if (parsed.import && typeof parsed.import === 'object') {
            for (const [alias, contractPath] of Object.entries(
                parsed.import as Record<string, unknown>,
            )) {
                if (typeof contractPath === 'string') {
                    imports[alias] = contractPath;
                }
            }
        }

        const importAliases = new Set(Object.keys(imports));

        // Parse inputSchema → JayObjectType
        let inputType: JayObjectType;
        if (
            typeof parsed.inputSchema === 'object' &&
            parsed.inputSchema !== null &&
            Object.keys(parsed.inputSchema).length > 0
        ) {
            inputType = parseObjectType(
                parsed.inputSchema as Record<string, unknown>,
                importAliases,
                ['input'],
            );
        } else {
            inputType = new JayObjectType('input', {});
        }

        // Parse outputSchema → JayType
        let outputType: JayType | undefined;
        if (parsed.outputSchema !== undefined && parsed.outputSchema !== null) {
            outputType =
                resolveActionType(parsed.outputSchema, importAliases, ['output']) ?? undefined;
        }

        const definition: ActionDefinition = {
            name: parsed.name as string,
            description: parsed.description as string,
            imports,
            inputType,
            outputType,
        };

        return new WithValidations(definition, []);
    } catch (e: any) {
        throw new Error(`Failed to parse action YAML for ${fileName}: ${e.message}`);
    }
}
