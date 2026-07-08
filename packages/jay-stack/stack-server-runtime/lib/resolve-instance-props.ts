import type { PageProps } from '@jay-framework/fullstack-component';
import type { ContractProp } from '@jay-framework/compiler-jay-html';

/**
 * Scope for resolving static headless instance prop bindings like `{p.categorySlug}`.
 * Page parts run before instances, so keyed ViewState (e.g. `p`) is available in pageViewState.
 */
export interface InstanceBindingContext {
    pageViewState?: object;
    pageParams?: object;
    pageProps?: PageProps;
}

/**
 * Resolve a dot-path value from an object (e.g. "p.categorySlug" → obj.p.categorySlug).
 */
export function resolvePathValue(obj: object, path: string): unknown {
    return path.split('.').reduce((current: unknown, segment) => {
        if (current === null || current === undefined) return undefined;
        return (current as Record<string, unknown>)[segment];
    }, obj);
}

/**
 * Resolve a single prop value: literal strings pass through; `{path}` reads from scope.
 */
export function resolvePropBinding(value: string, scope: object): string {
    const match = value.match(/^\{(.+)\}$/);
    if (!match) {
        return value;
    }
    const resolved = resolvePathValue(scope, match[1]);
    if (resolved === undefined || resolved === null) {
        return '';
    }
    return String(resolved);
}

/**
 * Merge page props, route params, and slow ViewState into one binding lookup scope.
 * ViewState wins on key conflicts so keyed headless data (e.g. `p`) is authoritative.
 */
export function buildInstanceBindingScope(context: InstanceBindingContext = {}): object {
    const { pageProps = {}, pageParams = {}, pageViewState = {} } = context;
    return { ...pageProps, ...pageParams, ...pageViewState };
}

/**
 * Normalize HTML attribute names to contract prop names and resolve `{binding}` values.
 */
export function normalizeAndResolveInstanceProps(
    instanceProps: Record<string, string>,
    contractProps: ContractProp[] | undefined,
    bindingContext?: InstanceBindingContext,
): Record<string, string> {
    const scope = buildInstanceBindingScope(bindingContext);
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(instanceProps)) {
        const match = contractProps?.find((p) => p.name.toLowerCase() === key.toLowerCase());
        const propName = match ? match.name : key;
        normalized[propName] = resolvePropBinding(String(value), scope);
    }
    return normalized;
}
