import {
    Import,
    Imports,
    isImportedType,
    isObjectType,
    isRecursiveType,
    JayArrayType,
    JayImportedType,
    JayImportName,
    JayType,
    JayUnknown,
    JayValidations,
    RenderFragment,
} from '@jay-framework/compiler-shared';
import { parse } from './expression-parser.cjs';

export class Accessor {
    readonly rootVar: string;
    readonly terms: Array<string>;
    readonly validations: JayValidations;
    readonly resolvedType: JayType;

    constructor(
        rootVar: string,
        terms: Array<string>,
        validations: JayValidations,
        resolvedType: JayType,
    ) {
        this.rootVar = rootVar;
        this.terms = terms;
        this.validations = validations;
        this.resolvedType = resolvedType;
    }

    render() {
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
    private readonly children: Record<string, Variables> = {};
    private readonly depth;
    constructor(currentTypes: JayType, parent: Variables = undefined, depth: number = 0) {
        this.currentVar = depth === 0 ? 'vs' : 'vs' + depth;
        this.currentContext = depth === 0 ? 'context' : 'cx' + depth;
        this.depth = depth;
        this.parent = parent;
        this.currentType =
            currentTypes instanceof JayImportedType ? currentTypes.type : currentTypes;
    }

    resolveAccessor(accessor: Array<string>): Accessor {
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
            const variables = new Variables(resolvedForEachType, this, this.depth + 1);
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
            const variables = new Variables(accessor.resolvedType, this, depth);
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
    ✓ if="count > 0"                (numeric comparison)
    ✓ if="page <= 1"                (<=, >=, <, > supported)
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

function doParse(expression: string, startRule: string, vars?: Variables) {
    try {
        return parse(expression, {
            vars,
            RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            da: Imports.for(Import.dynamicAttribute),
            dp: Imports.for(Import.dynamicProperty),
            ba: Imports.for(Import.booleanAttribute),
            startRule,
        });
    } catch (e) {
        const help = getExpressionHelp(startRule);
        const contextInfo = help ? `\n\nExpected format for ${startRule}:${help}` : '';
        throw new Error(`Failed to parse expression [${expression}].

Parse error: ${e.message}${contextInfo}`);
    }
}

export function parseAccessor(expression: string, vars: Variables): Accessor {
    return doParse(expression, 'accessor', vars);
}

export function parseCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'conditionFunc', vars);
}

export function parseReactCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'condition', vars);
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
    return doParse(expression, 'reactDynamicText', vars).map((_) => unescapeBackslash(_));
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
    return doParse(expression, 'reactDynamicProperty', vars);
}

export function parseComponentPropExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicComponentProp', vars);
}

export function parseClassExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'classExpression', vars);
}

export function parseReactClassExpression(expression: string, vars: Variables): RenderFragment {
    const { rendered, validations, refs }: RenderFragment = doParse(
        expression,
        'reactClassExpression',
        vars,
    );
    return new RenderFragment(rendered, Imports.none(), validations, refs);
}

export function parseImportNames(expression: string): JayImportName[] {
    return doParse(expression, 'importNames');
}

export function parseIsEnum(expression: string): boolean {
    try {
        return doParse(expression, 'is_enum');
    } catch (err) {
        return false;
    }
}
export function parseEnumValues(expression: string): string[] {
    return doParse(expression, 'enum');
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
