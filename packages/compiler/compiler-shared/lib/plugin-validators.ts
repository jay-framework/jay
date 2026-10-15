import { TemplatePart } from './validator-utils';

export interface ValidationFindingLocation {
    /** Defaults to the template file when omitted. */
    file?: string;
    line: number;
}

export interface JayHtmlValidationFinding {
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
    element?: string;
    attribute?: string;
    /** e.g. `css-first/allow-timer-animation` — namespace is the prefix before `/`. */
    ruleId?: string;
    location?: ValidationFindingLocation;
    /** Key silenced via `<namespace>: { <key>: true }` in application/jay-validations. */
    suppressKey?: string;
}

export interface ComponentScript {
    /** Relative to projectRoot, e.g. `src/pages/shop/page.ts`. */
    filePath: string;
    /** Lazily read; cached for the validate run. */
    readonly text: string;
    /** Lazily parsed with ts.createSourceFile; cached per path for the validate run. */
    readonly sourceFile: import('typescript').SourceFile;
}

/** One per validate run, keyed by absolute script path. */
export type ScriptCache = Map<string, ComponentScript>;

export interface JayHtmlHeadMeta {
    title?: TemplatePart[];
    meta: Array<{
        name?: string;
        property?: string;
        content: TemplatePart[];
    }>;
    links: Array<{
        rel: string;
        href: TemplatePart[];
        [key: string]: any;
    }>;
}

export interface JayHtmlValidationContext {
    body: any;
    filePath: string;
    projectRoot: string;
    css?: string;
    head?: JayHtmlHeadMeta;
    /** Per-page validation overrides from <script type="application/jay-validations">. Keyed by plugin name. */
    validationOverrides?: Record<string, Record<string, boolean | string[]>>;
    contract?: {
        name: string;
        tags: Array<{
            tag: string;
            type: number[];
            meta?: Record<string, string>;
            tags?: any[];
            repeated?: boolean;
            [key: string]: any;
        }>;
        props?: Array<{ name: string; required?: boolean; [key: string]: any }>;
        params?: Array<{ name: string; kind: string }>;
    };
    headlessImports: Array<{
        key?: string;
        contractName: string;
        contract?: JayHtmlValidationContext['contract'];
        providedHeadTags?: string[];
    }>;
    /** Sibling component script (`<basename>.ts`, then `page.ts`). Absent when there is none. */
    script?: ComponentScript;
}

export type JayHtmlValidatorFn = (
    context: JayHtmlValidationContext,
) => JayHtmlValidationFinding[] | Promise<JayHtmlValidationFinding[]>;
