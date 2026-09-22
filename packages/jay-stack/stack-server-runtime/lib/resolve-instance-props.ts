import type { PageProps } from '@jay-framework/fullstack-component';
import type { Coordinate, RuntimeContract } from './types';

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
 *
 * DL#190 — the resolved value is returned **as-is** (not `String(...)`-ed). A binding to a
 * page/parent object or array delivers the real object/array (stringifying it would flatten it to
 * `"[object Object]"`); a binding to a number/boolean delivers that value. Coercion of literal
 * attribute strings by declared `dataType` happens in `coerceInstancePropValue`.
 */
export function resolvePropBinding(value: string, scope: object): unknown {
    const match = value.match(/^\{(.+)\}$/);
    if (!match) {
        return value;
    }
    const resolved = resolvePathValue(scope, match[1]);
    if (resolved === undefined || resolved === null) {
        return '';
    }
    return resolved;
}

/**
 * DL#190 — coerce a single resolved instance prop value to its declared `dataType`.
 *
 * Instance props originate from HTML attributes (`status="success"`, `count="42"`,
 * `featured="false"`), so a *literal* value arrives as a string and must be parsed to the contract's
 * declared type; otherwise the serialized `__headlessInstances` ships `count:"42"` / `featured:"false"`,
 * which diverges from the SSR DOM (the server-element codegen coerces) and breaks client hydration.
 * Values that already arrived typed — an object/array/number/boolean bound from a higher
 * component/page — pass through untouched.
 *
 * `dataType` is a structural view of `JayType` (this runtime package avoids a compiler dependency):
 * an enum carries an ordered `values` array of member names; primitives carry `name`.
 *
 * Semantics match the compiler's `structural-coercions.ts` codegen exactly:
 * - enum   → member-name string maps to its numeric value via declaration order; an
 *            already-numeric value (possibly stringified) passes through as a number.
 * - number → `Number(value)`
 * - boolean→ `true` only for `'true'`
 * - string → unchanged
 * - `''` (unresolved fast/interactive binding at slow, DL#189) → left as `''`, never coerced.
 */
export function coerceInstancePropValue(
    value: unknown,
    dataType?: { name?: string; values?: string[] },
): string | number | boolean | object {
    // Already-typed (object/array/number/boolean bound from a higher component/page), an
    // unresolved binding (''), or no declared type → pass through untouched.
    if (typeof value !== 'string' || value === '' || !dataType) return value as any;
    if (Array.isArray(dataType.values)) {
        const memberIndex = dataType.values.indexOf(value);
        if (memberIndex >= 0) return memberIndex;
        const asNumber = Number(value);
        return Number.isNaN(asNumber) ? value : asNumber;
    }
    if (dataType.name === 'number') return Number(value);
    if (dataType.name === 'boolean') return value === 'true';
    return value;
}

/**
 * DL#194 — pick the ViewState a headless instance resolves its prop bindings against.
 *
 * A **nested** instance (one with an enclosing headless instance) resolves against its enclosing
 * instance's already-resolved ViewState — so `<jay:card heading="{title}">` inside `section` reads
 * `section.title`, and `<jay:button label="{heading}">` inside `card` reads `card.heading`. This holds
 * whether the enclosing field was threaded from the page or computed in the enclosing component's `.ts`
 * (the value is its resolved ViewState either way), and it works across a Tier 2 intermediate because a
 * Tier 2 passthrough component is itself a resolved instance whose ViewState echoes its props.
 *
 * A **top-level** instance (no enclosing instance) resolves against the page ViewState — unchanged
 * behavior. Requires parent-before-child resolution order (discovery is depth-first parent-first).
 */
export function enclosingInstanceViewState(
    parentCoordinate: Coordinate | undefined,
    resolvedViewStatesByCoordinate: Record<string, object>,
    pageViewState: object,
): object {
    if (!parentCoordinate) return pageViewState;
    return resolvedViewStatesByCoordinate[parentCoordinate.join('/')] ?? {};
}

/**
 * Merge page props, route params, and slow ViewState into one binding lookup scope.
 * ViewState wins on key conflicts so keyed headless data (e.g. `p`) is authoritative.
 * Includes `jay.*` built-in bindings (DL#163) for resolving `{jay.url.path}` etc.
 */
export function buildInstanceBindingScope(context: InstanceBindingContext = {}): object {
    const { pageProps, pageParams = {}, pageViewState = {} } = context;
    const url = pageProps?.url || '';
    const urlPath = url.split('?')[0];
    return {
        ...pageProps,
        ...pageParams,
        ...pageViewState,
        jay: {
            params: pageParams || {},
            url: { path: urlPath.startsWith('/') ? urlPath : '/' + urlPath },
        },
    };
}

/**
 * Normalize HTML attribute names to contract prop names, keeping the raw binding text.
 *
 * DL#189 — the slow phase must not bake resolved literals into the data the fast phase
 * consumes: a `fast` / `fast+interactive` prop bound to `{currentStatus}` is not yet
 * resolvable at slow (it would collapse to `''`). Storing the raw binding lets the fast
 * phase re-resolve it against the merged slow+fast scope. Names are still normalized here
 * so downstream lookups are stable.
 */
export function normalizeInstancePropNames(
    instanceProps: Record<string, string>,
    contractProps: RuntimeContract['props'],
): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(instanceProps)) {
        const match = contractProps?.find((p) => p.name.toLowerCase() === key.toLowerCase());
        const propName = match ? match.name : key;
        normalized[propName] = String(value);
    }
    return normalized;
}

/**
 * Normalize HTML attribute names to contract prop names, resolve `{binding}` values, and coerce
 * each resolved value to its declared prop `dataType` (DL#190).
 */
export function normalizeAndResolveInstanceProps(
    instanceProps: Record<string, string>,
    contractProps: RuntimeContract['props'],
    bindingContext?: InstanceBindingContext,
): Record<string, string | number | boolean | object> {
    const scope = buildInstanceBindingScope(bindingContext);
    const normalized: Record<string, string | number | boolean | object> = {};
    for (const [key, value] of Object.entries(instanceProps)) {
        const match = contractProps?.find((p) => p.name.toLowerCase() === key.toLowerCase());
        const propName = match ? match.name : key;
        const resolved = resolvePropBinding(value, scope);
        normalized[propName] = coerceInstancePropValue(resolved, match?.dataType);
    }
    return normalized;
}
