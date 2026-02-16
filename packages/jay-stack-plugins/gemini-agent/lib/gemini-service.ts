/**
 * Stateless wrapper around the @google/genai SDK.
 *
 * Receives the full conversation history on each call (no server-side state).
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { FunctionDeclaration, Schema } from '@google/genai';
import type { GeminiMessage, GeminiFunctionDeclaration, GeminiServiceConfig } from './gemini-types';

/**
 * Maps JSON Schema type strings to Gemini SDK Type enum values.
 */
const TYPE_MAP: Record<string, Type> = {
    object: Type.OBJECT,
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
};

/**
 * Converts a JSON Schema property to a Gemini SDK Schema.
 */
function toGeminiSchema(schema: Record<string, any>): Schema {
    const result: Schema = {};

    if (schema.type) {
        result.type = TYPE_MAP[schema.type] || Type.STRING;
    }
    if (schema.description) {
        result.description = schema.description;
    }
    if (schema.enum) {
        result.enum = schema.enum;
    }
    if (schema.items) {
        result.items = toGeminiSchema(schema.items);
    }
    if (schema.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            result.properties[key] = toGeminiSchema(value as Record<string, any>);
        }
    }
    if (schema.required) {
        result.required = schema.required;
    }

    return result;
}

/**
 * Converts our internal GeminiFunctionDeclaration to the SDK FunctionDeclaration.
 */
function toSdkDeclaration(decl: GeminiFunctionDeclaration): FunctionDeclaration {
    return {
        name: decl.name,
        description: decl.description,
        parameters: toGeminiSchema(decl.parameters),
    };
}

export class GeminiService {
    private client: GoogleGenAI;

    constructor(private config: GeminiServiceConfig) {
        this.client = new GoogleGenAI({ apiKey: config.apiKey });
    }

    get model(): string {
        return this.config.model;
    }

    get systemPromptPrefix(): string | undefined {
        return this.config.systemPrompt;
    }

    async generateWithTools(
        messages: GeminiMessage[],
        tools: GeminiFunctionDeclaration[],
        systemPrompt: string,
    ) {
        const sdkDeclarations = tools.map(toSdkDeclaration);

        const response = await this.client.models.generateContent({
            model: this.config.model,
            contents: messages,
            config: {
                systemInstruction: systemPrompt,
                tools:
                    sdkDeclarations.length > 0
                        ? [{ functionDeclarations: sdkDeclarations }]
                        : undefined,
            },
        });
        return response;
    }
}
