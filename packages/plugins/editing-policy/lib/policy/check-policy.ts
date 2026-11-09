import { matchGlob } from '../glob.js';
import type { ProjectValidationFinding } from '@jay-framework/compiler-shared';
import {
    ADMIN_ROLE,
    DEFAULT_TEMPLATES_GLOB,
    PolicyFile,
    RULE_NAMES,
    RULE_VALUES,
    RuleName,
    SUPPORTED_VERSION,
} from './schema.js';
import { ParsedSelector, parseSelector, SelectorParseError } from './selector.js';

const POLICY_FILE = 'jay-policy.md';

export interface CheckPolicyContext {
    /** Project-root-relative file paths — enables "selector matches nothing" / templates checks. Omit to skip. */
    projectFiles?: string[];
    /** Set of `"<path>#<name>"` policy markers found in the project, for `#name` selector coverage. */
    projectMarkers?: Set<string>;
}

/**
 * Validate a parsed policy file (DL#231 §6.2). Returns findings in the project-validator shape. Pure:
 * project-aware checks run only when `ctx.projectFiles` is supplied.
 */
export function checkPolicy(
    policy: PolicyFile,
    ctx: CheckPolicyContext = {},
): ProjectValidationFinding[] {
    const findings: ProjectValidationFinding[] = [];
    const err = (message: string, suggestion?: string) =>
        findings.push({ severity: 'error', file: POLICY_FILE, message, suggestion });
    const warn = (message: string, suggestion?: string) =>
        findings.push({ severity: 'warning', file: POLICY_FILE, message, suggestion });

    if (policy.version !== SUPPORTED_VERSION) {
        err(
            `Unsupported policy version ${JSON.stringify(policy.version)} (expected ${SUPPORTED_VERSION})`,
            `Set "version: ${SUPPORTED_VERSION}" in the frontmatter`,
        );
    }

    if (!policy.body || policy.body.trim() === '') {
        warn(
            'Policy file has no markdown body',
            'Add guideline text below the frontmatter; agents read it as the authoring policy',
        );
    }

    const templatesGlobs =
        policy.templates && policy.templates.length > 0
            ? policy.templates
            : [DEFAULT_TEMPLATES_GLOB];
    const templatesMatchSomething = ctx.projectFiles
        ? templatesGlobs.some((g) => ctx.projectFiles!.some((f) => matchGlob(f, g)))
        : undefined;

    if (
        policy.defaultRole !== undefined &&
        policy.defaultRole !== ADMIN_ROLE &&
        !(policy.defaultRole in policy.roles)
    ) {
        err(
            `defaultRole "${policy.defaultRole}" is not a defined role`,
            'Point defaultRole at one of the roles (most restrictive), or remove it',
        );
    }

    let usesFromTemplate = false;

    for (const [roleName, entries] of Object.entries(policy.roles)) {
        const seenSelectors = new Set<string>();
        let hasFallback = false;

        for (const entry of entries) {
            if (typeof entry.selector !== 'string' || entry.selector.trim() === '') {
                err(
                    `Role "${roleName}" has an entry with no "selector"`,
                    'Every role entry needs a "selector"',
                );
                continue;
            }

            if (seenSelectors.has(entry.selector)) {
                err(
                    `Role "${roleName}" has a duplicate selector "${entry.selector}"`,
                    'Merge the duplicate selector entries; later rules do not override earlier ones',
                );
            }
            seenSelectors.add(entry.selector);

            let parsed: ParsedSelector;
            try {
                parsed = parseSelector(entry.selector);
            } catch (e) {
                if (e instanceof SelectorParseError) {
                    err(`Role "${roleName}" has an unparsable selector: ${e.message}`);
                    continue;
                }
                throw e;
            }

            if (parsed.pathGlob === '**' && parsed.section === undefined) hasFallback = true;

            if (parsed.section !== undefined && !parsed.pathGlob.endsWith('.jay-html')) {
                err(
                    `Selector "${entry.selector}" targets a section (#${parsed.section}) on a non-.jay-html path`,
                    'Section selectors (#name) are only valid on .jay-html files',
                );
            }

            for (const [ruleName, value] of Object.entries(entry.rules)) {
                if (!(RULE_NAMES as readonly string[]).includes(ruleName)) {
                    err(
                        `Role "${roleName}" selector "${entry.selector}" uses unknown rule "${ruleName}"`,
                        `Allowed rules: ${RULE_NAMES.join(', ')}`,
                    );
                    continue;
                }
                const rule = ruleName as RuleName;
                const allowed = RULE_VALUES[rule];
                if (!allowed.includes(value)) {
                    err(
                        `Rule "${rule}" on selector "${entry.selector}" has unknown value "${value}"`,
                        `Allowed values: ${allowed.join(', ')}`,
                    );
                }

                if (
                    rule === 'dependencies' &&
                    !matchGlob('package.json', parsed.pathGlob)
                ) {
                    err(
                        `Rule "dependencies" on selector "${entry.selector}" cannot match the root manifest`,
                        'Use a selector that matches package.json (e.g. "**" or "package.json")',
                    );
                }
                if (rule === 'overrideRoute' && !parsed.pathGlob.startsWith('src/pages')) {
                    err(
                        `Rule "overrideRoute" on selector "${entry.selector}" is outside the pages folder`,
                        'overrideRoute only applies to selectors under src/pages',
                    );
                }
                if ((rule === 'create' || rule === 'overrideRoute') && value === 'from-template') {
                    usesFromTemplate = true;
                }
                if (
                    rule === 'policy' &&
                    value === 'yes' &&
                    roleName !== ADMIN_ROLE &&
                    parsed.pathGlob !== '**' &&
                    matchGlob(POLICY_FILE, parsed.pathGlob)
                ) {
                    warn(
                        `Role "${roleName}" grants policy:yes on ${POLICY_FILE}; it can loosen the rules that govern later publishes`,
                        'Grant policy edits only to a role you trust to change the policy file',
                    );
                }
            }

            if (ctx.projectFiles) {
                if (parsed.section === undefined) {
                    const matches = ctx.projectFiles.some((f) =>
                        matchGlob(f, parsed.pathGlob),
                    );
                    if (!matches && parsed.pathGlob !== '**') {
                        warn(`Selector "${entry.selector}" matches no file in the project`);
                    }
                } else if (ctx.projectMarkers) {
                    const anyMarker = [...ctx.projectMarkers].some((m) => {
                        const hashIdx = m.lastIndexOf('#');
                        const mp = m.slice(0, hashIdx);
                        const mn = m.slice(hashIdx + 1);
                        return (
                            mn === parsed.section && matchGlob(mp, parsed.pathGlob)
                        );
                    });
                    if (!anyMarker) {
                        warn(
                            `Selector "${entry.selector}" matches no jay-policy="${parsed.section}" marker in the project`,
                        );
                    }
                }
            }
        }

        if (!hasFallback && roleName !== ADMIN_ROLE) {
            warn(
                `Role "${roleName}" has no "**" fallback selector; unset rules are denied`,
                'Add a `selector: "**"` entry as the role baseline',
            );
        }
    }

    if (usesFromTemplate && templatesMatchSomething === false) {
        err(
            `A role uses from-template but no component matches the templates globs (${templatesGlobs.join(', ')})`,
            'Add template components under the templates globs, or set "templates:" to where they live',
        );
    }

    return findings;
}
