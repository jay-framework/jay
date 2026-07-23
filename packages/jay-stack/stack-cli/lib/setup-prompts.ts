import type { PluginSetupPrompt } from '@jay-framework/stack-server-runtime';
import { input, confirm, select } from '@inquirer/prompts';

export function createInteractivePrompt(): PluginSetupPrompt {
    return {
        async input(options) {
            return input({
                message: options.message,
                validate: options.validate,
            });
        },
        async confirm(options) {
            return confirm({
                message: options.message,
                default: options.default,
            });
        },
        async select(options) {
            return select({
                message: options.message,
                choices: options.choices.map((c) => ({ name: c.name, value: c.value })),
            });
        },
    };
}

export function createNonInteractivePrompt(): PluginSetupPrompt {
    return {
        async input() {
            return '';
        },
        async confirm(options) {
            return options.default ?? false;
        },
        async select(options) {
            return options.choices[0]?.value ?? '';
        },
    };
}
