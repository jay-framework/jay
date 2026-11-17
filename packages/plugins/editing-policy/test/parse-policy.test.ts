import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePolicy, PolicyParseError } from '../lib/policy/parse-policy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const policiesDir = path.join(here, 'fixtures', 'policies');

describe('parsePolicy', () => {
    it('parses the reference policy frontmatter and body', () => {
        const content = fs.readFileSync(path.join(policiesDir, 'valid.md'), 'utf-8');
        const policy = parsePolicy(content);

        expect(policy.version).toBe(1);
        expect(policy.defaultRole).toBe('client');
        expect(policy.templates).toEqual(['src/components/templates/**']);
        expect(policy.correctness).toEqual({ validate: true });
        expect(Object.keys(policy.roles)).toEqual(['developer', 'designer', 'client']);
        expect(policy.body.startsWith('# Editing policy')).toBe(true);
    });

    it('normalises rule values to strings (yes/no stay strings, booleans coerce)', () => {
        const content = [
            '---',
            'version: 1',
            'roles:',
            '  developer:',
            '    - selector: "**"',
            '      rules: { code: yes, delete: no, design: true, rename: false }',
            '---',
            '',
            '# body',
            '',
        ].join('\n');
        const policy = parsePolicy(content);
        expect(policy.roles.developer[0].rules).toEqual({
            code: 'yes',
            delete: 'no',
            design: 'yes',
            rename: 'no',
        });
    });

    it('throws PolicyParseError on malformed YAML frontmatter', () => {
        const content = fs.readFileSync(path.join(policiesDir, 'invalid', 'bad-yaml.md'), 'utf-8');
        expect(() => parsePolicy(content)).toThrow(PolicyParseError);
    });

    it('throws PolicyParseError when the frontmatter block is missing', () => {
        expect(() => parsePolicy('# just markdown, no frontmatter')).toThrow(PolicyParseError);
    });
});
