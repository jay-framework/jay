// Policy file schema (DL#231 §6.1). All rules hang off selectors; a policy is read from the baseline.

/** Rule names. What each governs is decided by file type, not by the selector (DL#231 §6.1 table). */
export const RULE_NAMES = [
    'content',
    'design',
    'css',
    'code',
    'dependencies',
    'config',
    'create',
    'delete',
    'rename',
    'overrideRoute',
    'policy',
    'edit',
    'publish',
    'onViolation',
] as const;
export type RuleName = (typeof RULE_NAMES)[number];

/**
 * Allowed values per rule. YAML 1.2 parses bare `yes`/`no` as the strings `"yes"`/`"no"`; booleans
 * (`true`/`false`) are normalised to `"yes"`/`"no"` by the parser so every value here is a string.
 */
export const RULE_VALUES: Record<RuleName, readonly string[]> = {
    content: ['yes', 'no'],
    design: ['yes', 'no', 'designSystemOnly'],
    css: ['yes', 'no'],
    code: ['yes', 'no'],
    dependencies: ['yes', 'no'],
    config: ['yes', 'no'],
    create: ['yes', 'no', 'from-template'],
    delete: ['yes', 'no'],
    rename: ['yes', 'no'],
    overrideRoute: ['any', 'from-template', 'no'],
    policy: ['yes', 'no'],
    edit: ['no'],
    publish: ['direct', 'review'],
    onViolation: ['review', 'block'],
};

export type RuleSet = Partial<Record<RuleName, string>>;

export interface RoleSelectorRule {
    selector: string;
    rules: RuleSet;
}

export interface Correctness {
    /** The candidate must pass `jay-stack validate` (checked by the caller, passed in via --validated). */
    validate?: boolean;
}

export interface PolicyFile {
    version: number;
    /** Fail-safe role when the caller passes none; point it at the most restrictive role. */
    defaultRole?: string;
    /** Globs selecting the components that are templates (DL#196). Default `src/components/templates/**`. */
    templates?: string[];
    correctness?: Correctness;
    roles: Record<string, RoleSelectorRule[]>;
    /** The markdown body: agent guidelines, exposed verbatim through the agent-kit. */
    body: string;
}

/** The reserved role: no role rules, still subject to `correctness`. Never inferred from a name. */
export const ADMIN_ROLE = 'admin';

/** Default templates glob when the policy omits `templates`. */
export const DEFAULT_TEMPLATES_GLOB = 'src/components/templates/**';

export const SUPPORTED_VERSION = 1;
