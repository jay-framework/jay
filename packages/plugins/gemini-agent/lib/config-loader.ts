import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Configuration for the Gemini agent plugin.
 */
export interface GeminiAgentConfig {
    /** Gemini API key */
    apiKey: string;
    /** Model name (default: gemini-2.0-flash) */
    model: string;
    /** Optional system prompt prefix prepended to the generated system prompt */
    systemPrompt?: string;
}

const CONFIG_FILE_NAME = '.gemini.yaml';
const DEFAULT_MODEL = 'gemini-2.0-flash';

export function loadConfig(): GeminiAgentConfig {
    const configPath = path.join(process.cwd(), 'config', CONFIG_FILE_NAME);

    if (!fs.existsSync(configPath)) {
        throw new Error(
            `Gemini config file not found at: ${configPath}\n` +
                'Run "jay-stack setup gemini-agent" to create it.',
        );
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as any;

    if (!config) {
        throw new Error('Gemini config file is empty or invalid');
    }

    if (config.apiKey === undefined || config.apiKey === null) {
        throw new Error('Config validation failed: "apiKey" is required in .gemini.yaml');
    }

    if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
        throw new Error('Config validation failed: "apiKey" must be a non-empty string');
    }

    if (config.apiKey.startsWith('<')) {
        throw new Error(
            'Config validation failed: "apiKey" still has placeholder value. ' +
                'Replace it with your Gemini API key.',
        );
    }

    return {
        apiKey: config.apiKey,
        model: config.model || DEFAULT_MODEL,
        systemPrompt: config.systemPrompt || undefined,
    };
}
