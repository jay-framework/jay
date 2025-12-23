export interface ContractSchema {
    name: string;
    tags: ContractTag[];
}

export interface ContractTag {
    tag: string;
    type: string | string[];
    dataType?: string;
    elementType?: string;
    required?: boolean;
    repeated?: boolean;
    tags?: ContractTag[];
    link?: string;
}

/**
 * Converts a contract schema to complete jay-data script tag
 */
export function convertContractToScript(contractSchema?: ContractSchema): string {
    const yamlContent = contractSchema ? convertContractToYaml(contractSchema) : '';

    return `<script type="application/jay-data">
data:
${yamlContent}</script>`;
}

/**
 * Converts a contract schema to YAML format for jay-data scripts
 */
function convertContractToYaml(contractSchema: ContractSchema): string {
    if (!contractSchema.tags || contractSchema.tags.length === 0) {
        return '';
    }

    let result = '';
    for (const tag of contractSchema.tags) {
        result += convertTagToYaml(tag, 1);
    }
    return result;
}

function convertTagToYaml(tag: ContractTag, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    let result = `${indent}${tag.tag}: `;

    // Handle sub-contracts (nested tags)
    if (tag.tags && tag.tags.length > 0) {
        result += '\n';
        for (const nestedTag of tag.tags) {
            result += convertTagToYaml(nestedTag, indentLevel + 1);
        }
        return result;
    }

    // Handle repeater/array types
    if (tag.repeated) {
        result += '\n';
        result += `${indent}- id: string\n`;
        if (tag.tags) {
            for (const nestedTag of tag.tags) {
                result += convertTagToYaml(nestedTag, indentLevel + 1);
            }
        }
        return result;
    }

    // Handle data types
    if (tag.dataType) {
        if (tag.dataType.startsWith('enum')) {
            // Extract enum values from "enum (value1 | value2)" format
            const enumMatch = tag.dataType.match(/enum \(([^)]+)\)/);
            if (enumMatch) {
                const enumValues = enumMatch[1]
                    .split('|')
                    .map((v) => v.trim())
                    .join('|');
                result += `enum (${enumValues})\n`;
            } else {
                result += `${tag.dataType}\n`;
            }
        } else {
            result += `${tag.dataType}\n`;
        }
    } else {
        // Default to string for data tags without explicit type
        result += 'string\n';
    }

    return result;
}
