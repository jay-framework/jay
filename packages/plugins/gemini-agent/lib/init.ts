/**
 * Gemini agent plugin initialization.
 *
 * Server: loads config, creates GeminiService, registers it.
 * Client: no client-side init needed (component handles everything).
 */

import { makeJayInit, createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { loadConfig } from './config-loader';
import { GeminiService } from './agent/service';

// Service marker for dependency injection
export const GEMINI_SERVICE = createJayService<GeminiService>('GeminiService');

export const init = makeJayInit().withServer(() => {
    const config = loadConfig();

    const service = new GeminiService({
        apiKey: config.apiKey,
        model: config.model,
        systemPrompt: config.systemPrompt,
    });

    registerService(GEMINI_SERVICE, service);

    console.log(`[gemini-agent] Initialized (model: ${config.model})`);

    return {};
});
