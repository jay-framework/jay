import { TemplatePart } from './validator-utils';

export interface JayHtmlValidationFinding {
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
    element?: string;
    attribute?: string;
}

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
}

export type JayHtmlValidatorFn = (
    context: JayHtmlValidationContext,
) => JayHtmlValidationFinding[] | Promise<JayHtmlValidationFinding[]>;

/**
 * Context for a project-level validator (DL#232). Unlike {@link JayHtmlValidationContext},
 * it is invoked once per project, not once per jay-html file, so it carries no parsed DOM.
 *
 * Deliberately small (DL#232 decision C): `projectRoot` + the plugin's own `settings`. No parsed
 * `.jay` config — `JayConfig` lives in stack-cli, above this package; a validator that needs config
 * loads it via `projectRoot`. Widen only when a validator needs it.
 */
export interface ProjectValidationContext {
    projectRoot: string;
    /** The plugin's own settings, as for other plugin entry points. */
    settings?: unknown;
}

export interface ProjectValidationFinding {
    severity: 'error' | 'warning';
    /** Project-relative path, or `.jay` for a config finding. */
    file: string;
    message: string;
    /** Agent-actionable suggestion, as in DL#145. */
    suggestion?: string;
}

export type ProjectValidatorFn = (
    context: ProjectValidationContext,
) => ProjectValidationFinding[] | Promise<ProjectValidationFinding[]>;
