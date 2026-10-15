import type { JayHtmlValidatorFn } from '@jay-framework/compiler-shared';
import { runScriptRules } from './script-rules.js';
import { runTemplateRules } from './template-rules.js';

export const validateCssFirst: JayHtmlValidatorFn = (ctx) => {
    return [...runTemplateRules(ctx), ...runScriptRules(ctx)];
};
