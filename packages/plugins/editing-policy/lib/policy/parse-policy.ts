import { parse as parseYaml } from 'yaml';
import { PolicyFile, RoleSelectorRule, RuleSet } from './schema.js';

export class PolicyParseError extends Error {}

// A policy file is YAML frontmatter (between `---` fences) followed by a markdown body.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a policy file into {@link PolicyFile}. Throws {@link PolicyParseError} on a missing
 * frontmatter block or invalid YAML. Rule values are normalised to strings: YAML 1.2 already reads
 * bare `yes`/`no` as strings, and booleans (`true`/`false`) are coerced to `"yes"`/`"no"`.
 */
export function parsePolicy(content: string): PolicyFile {
    const match = content.match(FRONTMATTER_RE);
    if (!match) {
        throw new PolicyParseError(
            'policy file must start with a YAML frontmatter block delimited by `---`',
        );
    }
    const [, yamlText, body] = match;

    let data: unknown;
    try {
        data = parseYaml(yamlText);
    } catch (e) {
        throw new PolicyParseError(`invalid YAML frontmatter: ${(e as Error).message}`);
    }
    if (data === null || typeof data !== 'object') {
        throw new PolicyParseError('policy frontmatter must be a YAML mapping');
    }

    const record = data as Record<string, unknown>;
    const roles: Record<string, RoleSelectorRule[]> = {};
    const rawRoles = record.roles;
    if (rawRoles && typeof rawRoles === 'object') {
        for (const [roleName, entries] of Object.entries(rawRoles as Record<string, unknown>)) {
            roles[roleName] = Array.isArray(entries) ? entries.map(normalizeRoleEntry) : [];
        }
    }

    return {
        version: record.version as number,
        defaultRole: record.defaultRole as string | undefined,
        templates: record.templates as string[] | undefined,
        correctness: record.correctness as PolicyFile['correctness'],
        roles,
        body: (body ?? '').trim(),
    };
}

function normalizeRoleEntry(entry: unknown): RoleSelectorRule {
    const e = (entry ?? {}) as Record<string, unknown>;
    const rules: RuleSet = {};
    if (e.rules && typeof e.rules === 'object') {
        for (const [key, value] of Object.entries(e.rules as Record<string, unknown>)) {
            // Keep unknown keys so the validator can flag them; cast is safe for iteration.
            (rules as Record<string, string>)[key] = normalizeValue(value);
        }
    }
    return { selector: e.selector as string, rules };
}

function normalizeValue(value: unknown): string {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return String(value);
}
