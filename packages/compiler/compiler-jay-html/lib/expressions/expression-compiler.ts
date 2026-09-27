import {
    Import,
    Imports,
    isImportedType,
    isObjectType,
    isRecursiveType,
    JayArrayType,
    JayImportedType,
    JayImportName,
    JayString,
    JayType,
    JayUnknown,
    JayValidations,
    RenderFragment,
} from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import { parse } from './expression-parser.cjs';

/** DL#193 Capability A: the author-facing sigil for parent-scope access. */
const PARENT_TOKEN = '$parent';

/**
 * DL#193 Capability A: the closure parameter name for a `$parent` access climbing
 * `level` scopes. The runtime supplies these positionally from the live parent chain
 * (`parentDataChain`, nearest-first): level 1 → `_p1`, level 2 → `_p2`, …
 */
export function parentParamName(level: number): string {
    return `_p${level}`;
}

export class Accessor {
    readonly rootVar: string;
    readonly terms: Array<string>;
    readonly validations: JayValidations;
    readonly resolvedType: JayType;
    /** DL#193: how many scopes a `$parent` access climbs (0 = current scope). */
    readonly parentLevel: number;

    constructor(
        rootVar: string,
        terms: Array<string>,
        validations: JayValidations,
        resolvedType: JayType,
        parentLevel: number = 0,
    ) {
        this.rootVar = rootVar;
        this.terms = terms;
        this.validations = validations;
        this.resolvedType = resolvedType;
        this.parentLevel = parentLevel;
    }

    render() {
        // DL#193 Capability A: a `$parent` access does NOT root at the parent scope's
        // `currentVar` (not lexically in scope inside the child callback). It roots at an
        // extra closure param the binding helper supplies from its retained context.
        if (this.parentLevel > 0) {
            const param = parentParamName(this.parentLevel);
            const rendered = this.terms.length === 0 ? param : param + '.' + this.terms.join('?.');
            return new RenderFragment(
                rendered,
                Imports.none(),
                this.validations,
                undefined,
                undefined,
                this.parentLevel,
            );
        }
        let renderedAccessor =
            this.terms.length === 1 && this.terms[0] === '.'
                ? this.rootVar
                : this.rootVar + '.' + this.terms.join('?.');
        return new RenderFragment(`${renderedAccessor}`, Imports.none(), this.validations);
    }
}

export class Variables {
    readonly currentVar: string;
    readonly currentType: JayType;
    readonly currentContext: string;
    readonly parent: Variables;
    private readonly children: Record<string, Variables>;
    private readonly depth;
    /**
     * DL#193 Phase 2c: when true, this scope's `currentVar` is a real variable that is lexically
     * in scope at every descendant binding site (the server target inlines the whole tree into one
     * `renderToStream`, so `vs`, forEach item vars, and instance vars are all reachable by name).
     * In that world a `$parent` climb that lands on this scope must emit `currentVar` directly, not
     * a `_pN` closure param (which only exists in the client/hydrate per-binding callbacks). The
     * flag is inherited by every child scope so setting it once on the server root covers the tree.
     */
    readonly lexicallyInScope: boolean;
    constructor(
        currentTypes: JayType,
        parent: Variables = undefined,
        depth: number = 0,
        customVarName?: string,
        // {@link asLexical} reconstructs a view of the SAME scope; `children` carries the shared
        // child-scope cache across that reconstruction (default keeps a freshly-constructed scope
        // with its own empty cache).
        children: Record<string, Variables> = {},
        lexicallyInScope: boolean = false,
    ) {
        this.currentVar = customVarName || (depth === 0 ? 'vs' : 'vs' + depth);
        this.currentContext = depth === 0 ? 'context' : 'cx' + depth;
        this.depth = depth;
        this.parent = parent;
        this.currentType =
            currentTypes instanceof JayImportedType ? currentTypes.type : currentTypes;
        this.children = children;
        this.lexicallyInScope = lexicallyInScope;
    }

    /**
     * DL#193 Phase 2c: return a view of this scope marked lexically-in-scope (see
     * {@link lexicallyInScope}). Used by the server target on its root scope; child scopes
     * inherit the flag automatically through {@link childVariableFor} / {@link childVariableForWithData}.
     */
    asLexical(): Variables {
        if (this.lexicallyInScope) return this;
        return new Variables(
            this.currentType,
            this.parent,
            this.depth,
            this.currentVar,
            this.children,
            true,
        );
    }

    resolveAccessor(accessor: Array<string>): Accessor {
        if (accessor[0] === 'jay') {
            const jayPath = ['__jay', ...accessor.slice(1)];
            return new Accessor(this.currentVar, jayPath, [], JayString);
        }
        // DL#193 Capability A: `$parent.` climbs to an enclosing scope. Each leading
        // `$parent` token walks one level up the `Variables.parent` chain; the remaining
        // terms resolve against that ancestor's type. Type-safety flows automatically
        // because `resolvedType` comes from the ancestor scope.
        if (accessor[0] === PARENT_TOKEN) {
            let parentLevel = 0;
            let scope: Variables = this;
            let terms = accessor;
            while (terms[0] === PARENT_TOKEN) {
                parentLevel++;
                if (!scope.parent) {
                    const message = `${'$parent'.repeat(parentLevel)} used but there is no parent scope ${parentLevel} level(s) up`;
                    return new Accessor(
                        this.currentVar,
                        terms.slice(1),
                        [message],
                        JayUnknown,
                        parentLevel,
                    );
                }
                scope = scope.parent;
                terms = terms.slice(1);
            }
            const resolved = scope.resolveAccessor(terms);
            // DL#193 Phase 2c: when the landed ancestor is lexically in scope (server target), emit
            // its `currentVar` directly instead of a `_pN` closure param. Dropping the accumulated
            // `parentLevel` (keeping only `resolved.parentLevel`, which is 0 here) makes
            // {@link Accessor.render} take the normal lexical branch and keeps `parentDepth` at 0, so
            // the server guard passes untouched. The client/hydrate targets never set the flag, so
            // they keep climbing via `_pN`.
            const effectiveParentLevel = scope.lexicallyInScope
                ? resolved.parentLevel
                : parentLevel + resolved.parentLevel;
            return new Accessor(
                scope.currentVar,
                resolved.terms,
                resolved.validations,
                resolved.resolvedType,
                effectiveParentLevel,
            );
        }
        let curr: JayType = this.currentType;
        let validations = [];
        accessor.forEach((member) => {
            if (member === '.')
                return; // do not advance curr
            else if (isObjectType(curr) && curr.props[member]) {
                curr = curr.props[member];
                if (isImportedType(curr)) curr = curr.type;
                // Follow recursive type references
                if (isRecursiveType(curr) && curr.resolvedType) curr = curr.resolvedType;
            } else {
                validations.push(`the data field [${accessor.join('.')}] not found in Jay data`);
                curr = JayUnknown;
            }
        });
        return new Accessor(this.currentVar, accessor, validations, curr);
    }

    childVariableFor(accessor: Accessor): Variables {
        const path = accessor.terms.join('.');
        if (this.children[path]) return this.children[path];
        else {
            const resolvedForEachType = (accessor.resolvedType as JayArrayType).itemType;
            // DL#193 Phase 2c: inherit lexical-in-scope so a forEach item scope on the server is a
            // valid `$parent` climb target that emits its own item var (client keeps it false).
            const variables = new Variables(
                resolvedForEachType,
                this,
                this.depth + 1,
                undefined,
                {},
                this.lexicallyInScope,
            );
            this.children[path] = variables;
            return variables;
        }
    }

    childVariableForWithData(accessor: Accessor): Variables {
        const path = accessor.terms.join('.');
        if (this.children[path]) return this.children[path];
        else {
            // For with-data, use the resolved type directly (not itemType like forEach)
            // Count depth by traversing parent chain
            let depth = 1;
            let parent: Variables = this;
            const maxDepth = 100; // Safety limit
            while (parent && parent.parent && depth < maxDepth) {
                depth++;
                parent = parent.parent;
            }
            const variables = new Variables(
                accessor.resolvedType,
                this,
                depth,
                undefined,
                {},
                this.lexicallyInScope,
            );
            this.children[path] = variables;
            return variables;
        }
    }
}

/**
 * Provides context-specific help for parsing errors based on the expression type
 */
function getExpressionHelp(startRule: string): string {
    switch (startRule) {
        case 'booleanAttribute':
            return `
  Boolean attributes use condition-style syntax (no curly braces).
  Examples:
    ✓ disabled="isDisabled"
    ✓ disabled="!isValid"
    ✓ disabled="status == pending"  (enum comparison)
    ✓ disabled="count <= 0"         (numeric comparison)
    ✓ disabled="count == 5"         (equality with number)
    ✓ disabled="a >= b.value"       (field-to-field comparison)
    ✓ disabled="isLoading || !isValid"
    ✓ disabled (bare attribute for always-present)
    ✗ disabled="{isDisabled}" (no curly braces)`;

        case 'dynamicAttribute':
        case 'dynamicProperty':
            return `
  Dynamic attributes/properties use template-style syntax with curly braces.
  Examples:
    ✓ value="{inputValue}"
    ✓ href="/users/{userId}"
    ✓ data-count="{items.length}"
    ✓ title="Hello {name}!"`;

        case 'classExpression':
        case 'reactClassExpression':
            return `
  Class expressions support static classes and conditional classes.
  Examples:
    ✓ class="button primary"
    ✓ class="{isActive ? active}"
    ✓ class="{isActive ? active : inactive}"
    ✓ class="button {isPrimary ? primary : secondary}"
    ✓ class="{status == active ? active-class}"
    ✓ class="{count > 0 ? has-items}"`;

        case 'conditionFunc':
        case 'condition':
            return `
  Conditions support boolean properties, negation, comparisons, and logical operators.
  Examples:
    ✓ if="isVisible"
    ✓ if="!isHidden"
    ✓ if="status == active"         (enum comparison)
    ✓ if="url === currentPath"      (string field comparison)
    ✓ if="url === '/about'"         (string literal comparison)
    ✓ if="path ^= '/docs'"          (starts with)
    ✓ if="count > 0"                (numeric comparison)
    ✓ if="count == 5"               (equality with number)
    ✓ if="page <= 1"                (<=, >=, <, > supported)
    ✓ if="current >= other.value"   (field-to-field comparison)
    ✓ if="isEnabled && status != disabled"
    ✓ if="hasItems || count > 0"`;

        case 'dynamicText':
        case 'reactDynamicText':
            return `
  Dynamic text uses curly braces for interpolation.
  Examples:
    ✓ {title}
    ✓ Hello, {user.name}!
    ✓ Count: {items.length}`;

        case 'accessor':
            return `
  Accessors reference view state properties.
  Examples:
    ✓ propertyName
    ✓ nested.property
    ✓ . (self-reference)`;

        case 'importNames':
            return `
  Import names are comma-separated identifiers with optional renaming.
  Examples:
    ✓ MyComponent
    ✓ Component1, Component2
    ✓ Original as Renamed`;

        case 'enum':
            return `
  Enum values are defined with pipe-separated identifiers.
  Examples:
    ✓ enum(active | inactive | pending)`;

        case 'styleDeclarations':
            return `
  Style declarations use CSS syntax with optional dynamic bindings.
  Examples:
    ✓ style="color: red; padding: 10px"
    ✓ style="background: {bgColor}; width: {size}px"`;

        default:
            return '';
    }
}

function getFallbackForRule(
    startRule: string,
    expression: string,
    message: string,
): RenderFragment | Accessor {
    const validations = [message];
    const escaped = expression.replace(/'/g, "\\'");
    switch (startRule) {
        case 'conditionFunc':
            return new RenderFragment('vs => false', Imports.none(), validations);
        case 'condition':
            return new RenderFragment('false', Imports.none(), validations);
        case 'dynamicText':
        case 'reactDynamicText':
            return new RenderFragment(
                `dt(vs => '[INVALID: ${escaped}]')`,
                Imports.for(Import.dynamicText),
                validations,
            );
        case 'dynamicAttribute':
            return new RenderFragment(
                `da(vs => '[INVALID: ${escaped}]')`,
                Imports.for(Import.dynamicAttribute),
                validations,
            );
        case 'dynamicProperty':
        case 'reactDynamicProperty':
            return new RenderFragment(
                `dp(vs => undefined)`,
                Imports.for(Import.dynamicProperty),
                validations,
            );
        case 'booleanAttribute':
            return new RenderFragment(
                `ba(vs => false)`,
                Imports.for(Import.booleanAttribute),
                validations,
            );
        case 'classExpression':
        case 'reactClassExpression':
            return new RenderFragment(`''`, Imports.none(), validations);
        case 'dynamicComponentProp':
            return new RenderFragment('vs => undefined', Imports.none(), validations);
        case 'styleDeclarations':
            return new RenderFragment('[]', Imports.none(), validations);
        case 'accessor':
            return new Accessor('vs', [expression], validations, JayUnknown);
        case 'template':
        case 'templateParts':
            return new RenderFragment(`'${escaped}'`, Imports.none(), validations);
        default:
            return new RenderFragment('undefined', Imports.none(), validations);
    }
}

function doParse(
    expression: string,
    startRule: string,
    vars?: Variables,
    throwOnError: boolean = false,
) {
    try {
        return parse(expression, {
            vars,
            RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            da: Imports.for(Import.dynamicAttribute),
            dp: Imports.for(Import.dynamicProperty),
            ba: Imports.for(Import.booleanAttribute),
            cx: Imports.for(Import.classNames),
            startRule,
        });
    } catch (e) {
        const help = getExpressionHelp(startRule);
        const guideRef = '\nSee: agent-kit/designer/jay-html-template-syntax.md';
        const message = `Failed to parse expression [${expression}]: ${e.message}${help}${guideRef}`;
        if (throwOnError) {
            throw new Error(message);
        }
        return getFallbackForRule(startRule, expression, message);
    }
}

export function parseAccessor(expression: string, vars: Variables): Accessor {
    const result = doParse(expression, 'accessor', vars);
    if (result instanceof Accessor) return result;
    return new Accessor(vars.currentVar, [expression], result.validations, JayUnknown);
}

export function parseCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'conditionFunc', vars);
}

/**
 * DL#193 Capability A is not supported in the React target: the parent chain is supplied
 * to jay closures positionally (`(vs, _p1) => …`), but React bindings render as bare JSX
 * expressions (`{_p1.field}`) with no closure to receive the parent params — `_p1` would be
 * a runtime ReferenceError. Fail the compile with a clear message instead.
 */
function guardReactParentBinding(fragment: RenderFragment): RenderFragment {
    if (fragment.parentDepth === 0) return fragment;
    return new RenderFragment(
        fragment.rendered,
        fragment.imports,
        [...fragment.validations, '$parent bindings are not supported in the React target'],
        fragment.refs,
        fragment.recursiveRegions,
        fragment.parentDepth,
    );
}

export function parseReactCondition(expression: string, vars: Variables): RenderFragment {
    return guardReactParentBinding(doParse(expression, 'condition', vars));
}

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicText', vars);
}

function unescapeBackslash(jsCode) {
    return jsCode.replace(/\\(.)/g, (match, char) => {
        if (char === '\\') {
            return '\\'; // Retain a single backslash for '\\'
        }
        switch (char) {
            case 't':
                return '\t'; // Tab
            case 'n':
                return '\n'; // Newline
            case 'r':
                return '\r'; // Carriage return
            default:
                return char; // Leave other escaped characters as is
        }
    });
}

export function parseReactTextExpression(expression: string, vars: Variables): RenderFragment {
    return guardReactParentBinding(
        doParse(expression, 'reactDynamicText', vars).map((_) => unescapeBackslash(_)),
    );
}

export function parseBooleanAttributeExpression(
    expression: string,
    vars: Variables,
): RenderFragment {
    return doParse(expression, 'booleanAttribute', vars);
}

export function parseAttributeExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicAttribute', vars);
}

export function parsePropertyExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicProperty', vars);
}

export function parseReactPropertyExpression(expression: string, vars: Variables): RenderFragment {
    return guardReactParentBinding(doParse(expression, 'reactDynamicProperty', vars));
}

export function parseComponentPropExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicComponentProp', vars);
}

export function parseClassExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'classExpression', vars);
}

/**
 * DL#193: server (SSG/SSR) parent plumbing is Phase 4. Until then `$parent` bindings render a
 * `_pN` free variable in the server output. The server compiler renders text/attribute
 * expressions through ~15 `w(...)` sites that only carry `fragment.rendered` and drop
 * `fragment.validations`, so a per-fragment validation would never reach the output. Instead we
 * throw a tagged error from the single parse choke points; `generateServerElementFile` catches it
 * and surfaces it as a validation. This covers every site uniformly — no risk of a missed path
 * silently emitting a broken `_pN` free variable.
 */
export const UNSUPPORTED_TARGET_PARENT_MESSAGE =
    '$parent bindings are not yet supported in the server target';

export class UnsupportedServerParentBindingError extends Error {
    constructor() {
        super(UNSUPPORTED_TARGET_PARENT_MESSAGE);
        this.name = 'UnsupportedServerParentBindingError';
    }
}

function guardServerParentBinding(fragment: RenderFragment): RenderFragment {
    if (fragment.parentDepth === 0) return fragment;
    throw new UnsupportedServerParentBindingError();
}

/**
 * Parse a template expression and return the raw accessor without dt()/da() wrapping.
 * Returns [fragment, isDynamic]. For the server target.
 */
export function parseServerTemplateExpression(
    expression: string,
    vars: Variables,
): [RenderFragment, boolean] {
    const [fragment, isDynamic] = doParse(expression, 'template', vars);
    return [guardServerParentBinding(fragment), isDynamic];
}

import type { TemplatePart } from '@jay-framework/compiler-shared';

export function parseTemplateParts(value: string): TemplatePart[] {
    if (!value) return [];
    return doParse(value, 'templateParts');
}

/**
 * Parse a condition expression without arrow function wrapping.
 * Returns the raw condition (e.g., "vs.cond" instead of "vs => vs.cond").
 * For the server target.
 */
export function parseServerCondition(expression: string, vars: Variables): RenderFragment {
    return guardServerParentBinding(doParse(expression, 'condition', vars));
}

export function parseReactClassExpression(expression: string, vars: Variables): RenderFragment {
    const parsed: RenderFragment = doParse(expression, 'reactClassExpression', vars);
    const { rendered, validations, refs } = parsed;
    return guardReactParentBinding(
        new RenderFragment(rendered, Imports.none(), validations, refs, [], parsed.parentDepth),
    );
}

export function parseImportNames(expression: string): JayImportName[] {
    return doParse(expression, 'importNames', undefined, true);
}

export function parseIsEnum(expression: string): boolean {
    try {
        return doParse(expression, 'is_enum', undefined, true);
    } catch (err) {
        return false;
    }
}
export function parseEnumValues(expression: string): string[] {
    return doParse(expression, 'enum', undefined, true);
}

export interface StyleDeclaration {
    property: string;
    valueFragment: RenderFragment;
    isDynamic: boolean;
}

export interface StyleDeclarations {
    declarations: StyleDeclaration[];
    hasDynamic: boolean;
}

export function parseStyleDeclarations(styleString: string, vars: Variables): StyleDeclarations {
    return doParse(styleString, 'styleDeclarations', vars);
}

/**
 * Analyzed condition expression for slow-render evaluation
 * @deprecated Use parseConditionForSlowRender instead
 */
export interface AnalyzedCondition {
    /** The property path (without negation) */
    path: string;
    /** Whether the condition is negated (e.g., !imageUrl) */
    isNegated: boolean;
}

// =============================================================================
// Slow Render Condition Parsing (Option D: Partial Evaluation)
// Uses the PEG parser with 'slowCondition' start rule
// =============================================================================

/**
 * Context for slow rendering - provides slow-phase data for partial evaluation
 */
export interface SlowRenderContext {
    /** Slow-phase data values */
    slowData: Record<string, unknown>;
    /** Phase information for each property path */
    phaseMap: Map<string, { phase: string; isArray?: boolean; enumValues?: string[] }>;
    /** Current context path for nested properties (e.g., "products" when inside forEach) */
    contextPath: string;
}

/**
 * Result of parsing a condition for slow rendering
 */
export type ConditionResult =
    | { type: 'resolved'; value: boolean }
    | { type: 'runtime'; code: RenderFragment; simplifiedExpr?: string };

/**
 * Intermediate value during parsing - can be a resolved value or runtime code
 */
export type PartialValue =
    { type: 'resolved'; value: unknown } | { type: 'code'; fragment: RenderFragment; expr: string };

/**
 * Convert a value to its JavaScript truthiness
 */
function isTruthy(value: unknown): boolean {
    return !!value;
}

/**
 * Parse a condition expression for slow rendering with partial evaluation.
 *
 * This function uses the PEG parser with the 'slowCondition' start rule,
 * which substitutes slow-phase values and simplifies the expression.
 *
 * @param expr - The condition expression (e.g., "!imageUrl", "inStock && price > 0")
 * @param slowContext - Context with slow data and phase information
 * @param vars - Optional Variables for type-aware code generation
 * @returns Either a resolved boolean or runtime code
 *
 * @example
 * // Fully slow - resolves to boolean
 * parseConditionForSlowRender("!imageUrl", { slowData: { imageUrl: "" }, ... })
 * // Returns: { type: 'resolved', value: true }
 *
 * @example
 * // Mixed phase - simplifies and returns runtime code
 * parseConditionForSlowRender("inStock && price > 0", { slowData: { inStock: true }, ... })
 * // Returns: { type: 'runtime', code: RenderFragment("vs.price > 0") }
 */
export function parseConditionForSlowRender(
    expr: string,
    slowContext: SlowRenderContext,
    vars?: Variables,
): ConditionResult {
    try {
        const result: PartialValue = parse(expr, {
            vars,
            RenderFragment,
            none: Imports.none(),
            slowContext,
            startRule: 'slowCondition',
        });

        if (result.type === 'resolved') {
            return { type: 'resolved', value: isTruthy(result.value) };
        }

        return {
            type: 'runtime',
            code: result.fragment,
            simplifiedExpr: result.expr,
        };
    } catch (error) {
        // If parsing fails, fall back to treating the whole expression as runtime
        // This ensures we don't break on expressions we don't yet support
        getLogger().warn(
            `parseConditionForSlowRender: Failed to parse "${expr}": ${(error as Error).message}`,
        );
        // Generate simple runtime code without type info
        const code = `vs.${expr}`;
        const fragment = new RenderFragment(code, Imports.none());
        return { type: 'runtime', code: fragment, simplifiedExpr: expr };
    }
}
