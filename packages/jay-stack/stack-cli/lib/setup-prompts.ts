import type { PluginSetupPrompt } from '@jay-framework/stack-server-runtime';
import { SetupNeedsAnswerError } from '@jay-framework/stack-server-runtime';
import { input, confirm, select } from '@inquirer/prompts';

export function createInteractivePrompt(): PluginSetupPrompt {
    return {
        async input(options) {
            return input({ message: options.message, validate: options.validate });
        },
        async confirm(options) {
            return confirm({ message: options.message, default: options.default });
        },
        async select(options) {
            return select({
                message: options.message,
                choices: options.choices.map((c) => ({ name: c.name, value: c.value })),
            });
        },
    };
}

export function createAnswersFilePrompt(
    answers: Record<string, string>,
    pluginName: string,
): PluginSetupPrompt {
    return {
        async input(options) {
            const value = answers[options.key];
            if (value !== undefined) return value;
            throw new SetupNeedsAnswerError(pluginName, options.key, 'input', options.message);
        },
        async confirm(options) {
            const value = answers[options.key];
            if (value !== undefined) return value === 'true' || value === 'yes';
            throw new SetupNeedsAnswerError(pluginName, options.key, 'confirm', options.message);
        },
        async select(options) {
            const value = answers[options.key];
            if (value !== undefined) return value;
            throw new SetupNeedsAnswerError(
                pluginName,
                options.key,
                'select',
                options.message,
                options.choices,
            );
        },
    };
}

export function createDefaultPrompt(pluginName: string): PluginSetupPrompt {
    return {
        async input(options) {
            throw new SetupNeedsAnswerError(pluginName, options.key, 'input', options.message);
        },
        async confirm(options) {
            throw new SetupNeedsAnswerError(pluginName, options.key, 'confirm', options.message);
        },
        async select(options) {
            throw new SetupNeedsAnswerError(
                pluginName,
                options.key,
                'select',
                options.message,
                options.choices,
            );
        },
    };
}
