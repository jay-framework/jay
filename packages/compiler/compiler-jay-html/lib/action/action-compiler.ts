/**
 * Compiler for .jay-action files → .jay-action.d.ts
 *
 * Generates TypeScript Input and Output interfaces from action schema definitions.
 */

import { WithValidations } from '@jay-framework/compiler-shared';
import { ActionDefinition, ActionSchemaProperty } from './action-parser';
import { pascalCase } from 'change-case';

/**
 * Converts a JSON Schema property to a TypeScript type string.
 */
function schemaPropertyToTs(prop: ActionSchemaProperty, indent: string = '  '): string {
    if (prop.enum && prop.enum.length > 0) {
        return prop.enum.map((v) => `'${v}'`).join(' | ');
    }

    switch (prop.type) {
        case 'string':
            return 'string';
        case 'number':
        case 'integer':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'null':
            return 'null';
        case 'array':
            if (prop.items) {
                const itemType = schemaPropertyToTs(prop.items, indent);
                return `Array<${itemType}>`;
            }
            return 'unknown[]';
        case 'object':
            if (prop.properties && Object.keys(prop.properties).length > 0) {
                return renderInlineObject(prop.properties, prop.required, indent);
            }
            return 'Record<string, unknown>';
        default:
            return 'unknown';
    }
}

/**
 * Renders an inline object type from properties.
 */
function renderInlineObject(
    properties: Record<string, ActionSchemaProperty>,
    required?: string[],
    indent: string = '  ',
): string {
    const requiredSet = new Set(required || []);
    const lines: string[] = [];
    const childIndent = indent + '  ';

    for (const [propName, propDef] of Object.entries(properties)) {
        const optional = requiredSet.has(propName) ? '' : '?';
        const tsType = schemaPropertyToTs(propDef, childIndent);
        lines.push(`${childIndent}${propName}${optional}: ${tsType};`);
    }

    return `{\n${lines.join('\n')}\n${indent}}`;
}

/**
 * Renders a top-level interface from a schema.
 */
function renderInterface(
    interfaceName: string,
    properties: Record<string, ActionSchemaProperty>,
    required?: string[],
): string {
    const requiredSet = new Set(required || []);
    const lines: string[] = [];

    for (const [propName, propDef] of Object.entries(properties)) {
        const optional = requiredSet.has(propName) ? '' : '?';
        const tsType = schemaPropertyToTs(propDef, '  ');
        lines.push(`  ${propName}${optional}: ${tsType};`);
    }

    if (lines.length === 0) {
        return `export interface ${interfaceName} {}`;
    }

    return `export interface ${interfaceName} {\n${lines.join('\n')}\n}`;
}

/**
 * Renders an output type from an outputSchema.
 * Handles object types (as interfaces) and other types (as type aliases).
 */
function renderOutputType(typeName: string, schema: ActionSchemaProperty): string {
    if (schema.type === 'object' && schema.properties) {
        return renderInterface(typeName, schema.properties, schema.required);
    }

    const tsType = schemaPropertyToTs(schema);
    return `export type ${typeName} = ${tsType};`;
}

/**
 * Compiles an ActionDefinition into a TypeScript .d.ts string.
 *
 * @param actionWithValidations - Parsed action definition
 * @returns TypeScript definition string with validation messages
 */
export function compileAction(
    actionWithValidations: WithValidations<ActionDefinition>,
): WithValidations<string> {
    return actionWithValidations.map((action) => {
        const baseName = pascalCase(action.name);
        const sections: string[] = [];

        // Input interface
        const inputName = `${baseName}Input`;
        sections.push(
            renderInterface(inputName, action.inputSchema.properties, action.inputSchema.required),
        );

        // Output type (optional)
        if (action.outputSchema) {
            const outputName = `${baseName}Output`;
            sections.push(renderOutputType(outputName, action.outputSchema));
        }

        return sections.join('\n\n');
    });
}
