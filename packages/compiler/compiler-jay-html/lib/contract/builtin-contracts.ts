import { JayNumber, JayString } from '@jay-framework/compiler-shared';
import { Contract, ContractTagType } from './contract';

/**
 * Built-in contracts the compiler recognizes without any plugin/module resolution (Design Log #218).
 *
 * The Error contract backs error pages: a page declares
 * `<script type="application/jay-headless" plugin="jay-stack" contract="error" key="error">`
 * and the compiler special-cases this pair to {@link ERROR_CONTRACT} (no filesystem lookup),
 * giving the page a typed `error?: ErrorViewState` field. The matching `ErrorViewState` /
 * `ErrorRefs` types are shipped (hand-written, type-only) from {@link ERROR_CONTRACT_MODULE}
 * so the generated page imports resolve against a real, stable specifier.
 */
export const ERROR_CONTRACT_PLUGIN = 'jay-stack';
export const ERROR_CONTRACT_NAME = 'error';

/** The bare module specifier the generated `error` types are imported from. */
export const ERROR_CONTRACT_MODULE = '@jay-framework/fullstack-component';

/**
 * The built-in Error contract (Design Log #218).
 *
 * All fields are `fast` — the error data is a request-time pass-through injected at render,
 * not build-time slow data. `details` is a repeated sub-contract so a page can
 * `forEach="error.details"` over `{ key, value }` pairs.
 */
export const ERROR_CONTRACT: Contract = {
    name: 'Error',
    description: 'Built-in error information injected into error pages (Design Log #218).',
    tags: [
        { tag: 'status', type: [ContractTagType.data], dataType: JayNumber, phase: 'fast' },
        { tag: 'title', type: [ContractTagType.data], dataType: JayString, phase: 'fast' },
        { tag: 'message', type: [ContractTagType.data], dataType: JayString, phase: 'fast' },
        { tag: 'url', type: [ContractTagType.data], dataType: JayString, phase: 'fast' },
        { tag: 'code', type: [ContractTagType.data], dataType: JayString, phase: 'fast' },
        {
            tag: 'details',
            type: [ContractTagType.subContract],
            repeated: true,
            trackBy: 'key',
            phase: 'fast',
            tags: [
                { tag: 'key', type: [ContractTagType.data], dataType: JayString },
                { tag: 'value', type: [ContractTagType.data], dataType: JayString },
            ],
        },
    ],
};

/** True when a headless import's plugin/contract pair is the built-in Error contract. */
export function isBuiltInErrorContract(
    plugin: string | null | undefined,
    contract: string | null | undefined,
): boolean {
    return plugin === ERROR_CONTRACT_PLUGIN && contract === ERROR_CONTRACT_NAME;
}
