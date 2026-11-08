import fs from 'fs';
import path from 'path';
import type { ProjectValidationFinding, ProjectValidatorFn } from '@jay-framework/compiler-shared';
import { parsePolicy, PolicyParseError } from '../policy/parse-policy.js';
import { checkPolicy } from '../policy/check-policy.js';
import { collectPolicyMarkers, walkFiles } from '../fs/scan-project.js';

const POLICY_FILE = 'jay-policy.md';

/**
 * Project-level validator (DL#231 §6.2, DL#232 hook): runs only when `jay-policy.md` exists at the
 * project root. Reports bad YAML / unknown version / unknown rules / unparsable selectors / rules on
 * selectors that can't carry them / duplicate selectors, plus warnings (no `**` fallback, selectors
 * matching nothing, missing body, non-admin policy-file grants).
 */
export const validate: ProjectValidatorFn = (ctx) => {
    const policyPath = path.join(ctx.projectRoot, POLICY_FILE);
    if (!fs.existsSync(policyPath)) return [];

    const content = fs.readFileSync(policyPath, 'utf-8');

    try {
        const policy = parsePolicy(content);
        const files = walkFiles(ctx.projectRoot);
        const markers = collectPolicyMarkers(ctx.projectRoot, files);
        return checkPolicy(policy, { projectFiles: files, projectMarkers: markers });
    } catch (e) {
        if (e instanceof PolicyParseError) {
            const finding: ProjectValidationFinding = {
                severity: 'error',
                file: POLICY_FILE,
                message: e.message,
                suggestion:
                    'Fix the policy file: YAML frontmatter between `---` fences, then a markdown body',
            };
            return [finding];
        }
        throw e;
    }
};
