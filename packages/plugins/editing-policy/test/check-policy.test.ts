import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePolicy } from '../lib/policy/parse-policy.js';
import { checkPolicy, CheckPolicyContext } from '../lib/policy/check-policy.js';
import type { ProjectValidationFinding } from '@jay-framework/compiler-shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const policiesDir = path.join(here, 'fixtures', 'policies');
const invalidDir = path.join(policiesDir, 'invalid');

function check(fixture: string, ctx?: CheckPolicyContext): ProjectValidationFinding[] {
    const content = fs.readFileSync(path.join(invalidDir, `${fixture}.md`), 'utf-8');
    return checkPolicy(parsePolicy(content), ctx);
}

const RULES =
    'content, design, css, code, dependencies, config, create, delete, rename, overrideRoute, policy, edit, publish, onViolation';

// One case per failure class (DL#231 §6.2 / §9.2). `bad-yaml` is a parse-error class, covered in
// parse-policy.test.ts. Keys here must stay in sync with the fixtures/invalid directory (meta-test below).
const CASES: Record<string, { ctx?: CheckPolicyContext; expected: ProjectValidationFinding[] }> = {
    'unknown-version': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'Unsupported policy version 2 (expected 1)',
                suggestion: 'Set "version: 1" in the frontmatter',
            },
        ],
    },
    'unknown-rule-key': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'Role "developer" selector "**" uses unknown rule "foo"',
                suggestion: `Allowed rules: ${RULES}`,
            },
        ],
    },
    'unknown-rule-value': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'Rule "design" on selector "**" has unknown value "maybe"',
                suggestion: 'Allowed values: yes, no, designSystemOnly',
            },
        ],
    },
    'unparsable-selector': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message:
                    'Role "developer" has an unparsable selector: selector "src/pages/page.jay-html#a#b" has more than one \'#\'',
                suggestion: undefined,
            },
        ],
    },
    'missing-selector': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'Role "developer" has an entry with no "selector"',
                suggestion: 'Every role entry needs a "selector"',
            },
        ],
    },
    'dependencies-non-manifest': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message:
                    'Rule "dependencies" on selector "src/pages/**" cannot match the root manifest',
                suggestion:
                    'Use a selector that matches package.json (e.g. "**" or "package.json")',
            },
        ],
    },
    'section-on-non-jay-html': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message:
                    'Selector "src/styles/app.css#brand" targets a section (#brand) on a non-.jay-html path',
                suggestion: 'Section selectors (#name) are only valid on .jay-html files',
            },
        ],
    },
    'override-route-outside-pages': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message:
                    'Rule "overrideRoute" on selector "src/components/**" is outside the pages folder',
                suggestion: 'overrideRoute only applies to selectors under src/pages',
            },
        ],
    },
    'duplicate-selector': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'Role "developer" has a duplicate selector "src/pages/**"',
                suggestion:
                    'Merge the duplicate selector entries; later rules do not override earlier ones',
            },
        ],
    },
    'unknown-default-role': {
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'defaultRole "ghost" is not a defined role',
                suggestion:
                    'Point defaultRole at one of the roles (most restrictive), or remove it',
            },
        ],
    },
    'no-fallback': {
        expected: [
            {
                severity: 'warning',
                file: 'jay-policy.md',
                message: 'Role "client" has no "**" fallback selector; unset rules are denied',
                suggestion: 'Add a `selector: "**"` entry as the role baseline',
            },
        ],
    },
    'missing-body': {
        expected: [
            {
                severity: 'warning',
                file: 'jay-policy.md',
                message: 'Policy file has no markdown body',
                suggestion:
                    'Add guideline text below the frontmatter; agents read it as the authoring policy',
            },
        ],
    },
    'policy-yes-on-policy-file': {
        expected: [
            {
                severity: 'warning',
                file: 'jay-policy.md',
                message:
                    'Role "designer" grants policy:yes on jay-policy.md; it can loosen the rules that govern later publishes',
                suggestion: 'Grant policy edits only to a role you trust to change the policy file',
            },
        ],
    },
    'from-template-no-templates': {
        ctx: { projectFiles: ['src/pages/page.jay-html'] },
        expected: [
            {
                severity: 'error',
                file: 'jay-policy.md',
                message:
                    'A role uses from-template but no component matches the templates globs (src/components/templates/**)',
                suggestion:
                    'Add template components under the templates globs, or set "templates:" to where they live',
            },
        ],
    },
    'selector-matches-nothing': {
        ctx: { projectFiles: ['src/pages/page.jay-html'] },
        expected: [
            {
                severity: 'warning',
                file: 'jay-policy.md',
                message: 'Selector "src/pages/ghost/**" matches no file in the project',
                suggestion: undefined,
            },
        ],
    },
};

describe('checkPolicy — valid policy', () => {
    it('produces no findings for the reference policy (no project context)', () => {
        const content = fs.readFileSync(path.join(policiesDir, 'valid.md'), 'utf-8');
        expect(checkPolicy(parsePolicy(content))).toEqual([]);
    });
});

describe('checkPolicy — one case per failure class (DL#231 §6.2)', () => {
    for (const [fixture, { ctx, expected }] of Object.entries(CASES)) {
        it(`reports: ${fixture}`, () => {
            expect(check(fixture, ctx)).toEqual(expected);
        });
    }

    it('every invalid fixture has a case (meta-test)', () => {
        const files = fs
            .readdirSync(invalidDir)
            .filter((f) => f.endsWith('.md'))
            .map((f) => f.replace(/\.md$/, ''))
            .sort();
        // `bad-yaml` is a parse-error class covered in parse-policy.test.ts.
        const covered = [...Object.keys(CASES), 'bad-yaml'].sort();
        expect(files).toEqual(covered);
    });
});
