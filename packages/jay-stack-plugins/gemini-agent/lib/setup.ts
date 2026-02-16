/**
 * Setup handler for gemini-agent plugin.
 *
 * Creates config/.gemini.yaml template if missing, validates the API key.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const CONFIG_FILE_NAME = '.gemini.yaml';

const CONFIG_TEMPLATE = `# Gemini Agent Configuration
#
# This file contains credentials for the Gemini AI agent plugin.
# Get your API key from: https://aistudio.google.com/apikey
#
# IMPORTANT: This file contains secrets. Add config/.gemini.yaml to .gitignore.

# Required: Your Gemini API key
apiKey: "<your-gemini-api-key>"

# Optional: Model name (default: gemini-2.0-flash)
# model: gemini-2.0-flash

# Optional: Custom system prompt prefix (prepended to the generated system prompt)
# systemPrompt: "You are a helpful assistant for this web application."
`;

export async function setupGeminiAgent(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }

        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');

        return {
            status: 'needs-config',
            configCreated: [`config/${CONFIG_FILE_NAME}`],
            message: 'Fill in your Gemini API key and re-run: jay-stack setup gemini-agent',
        };
    }

    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = yaml.load(configContent) as any;

        if (!config) {
            return {
                status: 'error',
                message: `Config file is empty: config/${CONFIG_FILE_NAME}`,
            };
        }

        const apiKey = config.apiKey || '';
        const hasPlaceholder = apiKey.startsWith('<');
        const isEmpty = !apiKey;

        if (hasPlaceholder || isEmpty) {
            return {
                status: 'needs-config',
                message: `Config has placeholder value. Set your Gemini API key in config/${CONFIG_FILE_NAME}`,
            };
        }

        if (ctx.initError) {
            return {
                status: 'error',
                message: `Gemini initialization failed: ${ctx.initError.message}`,
            };
        }

        return {
            status: 'configured',
            message: `Gemini agent configured (model: ${config.model || 'gemini-2.0-flash'})`,
        };
    } catch (error: any) {
        return {
            status: 'error',
            message: `Failed to read config: ${error.message}`,
        };
    }
}
