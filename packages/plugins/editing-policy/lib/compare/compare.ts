import { createHash } from 'crypto';
import { ADMIN_ROLE, PolicyFile } from '../policy/schema.js';
import { classifyChanges } from '../changes/classify.js';
import { Change, Tree } from '../changes/types.js';
import { CompareResult, Disposition, Finding } from './types.js';
import { compileRole, decide, Decision, resolveRule } from './resolve.js';

export class PolicyToolError extends Error {}

export interface ComparePolicyInput {
    baseline: Tree;
    candidate: Tree;
    /** The role to evaluate under. Falls back to `policy.defaultRole` when omitted. */
    role?: string;
    policy: PolicyFile;
    /** Raw policy text, for the stable policy hash. */
    policyContent: string;
    /** Whether the caller ran `jay-stack validate` on the candidate (satisfies correctness.validate). */
    validated?: boolean;
}

function sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}

function where(change: Change): string {
    return change.section ? `${change.path}#${change.section}` : change.path;
}

function makeFinding(id: number, change: Change, decision: Decision, role: string): Finding {
    const loc = where(change);
    let message: string;
    let suggestion: string | undefined;

    if (decision.ruleId === 'edit:no') {
        message = `${change.kind} change on ${loc}, but that part is frozen (edit: no)`;
        suggestion = 'Revert the change, or request an edit from a role that owns this part';
    } else if (decision.ruleId.endsWith(':unset')) {
        message = `${change.kind} change on ${loc} has no matching rule for role "${role}" (denied by default)`;
        suggestion = `Add a rule for "${change.kind}" to a selector that matches ${loc}, or revert the change`;
    } else if (decision.ruleId.endsWith(':designSystemOnly')) {
        message = `design change on ${loc} must use only design-system tokens and elements; this cannot be auto-verified`;
        suggestion = 'Use design-system tokens/elements only, or request review from the designer';
    } else if (decision.ruleId.endsWith(':from-template')) {
        message = `new ${change.path} must be built from a template; this cannot be auto-verified`;
        suggestion = 'Build the page/section from a template region (template=), or request review';
    } else {
        message = `${change.kind} change on ${loc} is not allowed (rule ${decision.ruleId})`;
        suggestion = `Revert the change, or request review from a role that allows "${change.kind}"`;
    }

    return {
        id: `rule-${id}`,
        source: 'rule',
        severity: decision.onViolation,
        ruleId: decision.ruleId,
        selector: decision.selector,
        path: change.path,
        section: change.section,
        message,
        suggestion,
        role,
    };
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { block: 0, review: 1, info: 2 };

function dispositionFrom(findings: Finding[], publishReview: boolean): Disposition {
    if (findings.some((f) => f.severity === 'block')) return 'BLOCK';
    if (publishReview || findings.some((f) => f.severity === 'review')) return 'REVIEW';
    return 'PUBLISH';
}

/**
 * Compare a baseline and candidate tree under a role (DL#231 §6.3). Pure: no git, install, or network.
 * Throws {@link PolicyToolError} for an unknown role or when neither a role nor `defaultRole` is set.
 */
export function comparePolicy(input: ComparePolicyInput): CompareResult {
    const { baseline, candidate, policy, policyContent, validated } = input;
    const role = input.role ?? policy.defaultRole;

    if (!role) {
        throw new PolicyToolError(
            'No role given and the policy sets no defaultRole; pass --role or set defaultRole',
        );
    }

    const policyHash = sha256(policyContent);
    const changes = classifyChanges(baseline, candidate);

    const isAdmin = role === ADMIN_ROLE;
    if (!isAdmin && !(role in policy.roles)) {
        const defined = Object.keys(policy.roles).join(', ') || '(none)';
        throw new PolicyToolError(`Unknown role "${role}". Defined roles: ${defined}`);
    }

    const findings: Finding[] = [];
    let publishReview = false;
    let id = 0;

    if (!isAdmin) {
        const compiled = compileRole(policy.roles[role]);
        for (const change of changes) {
            const decision = decide(compiled, change);
            if (!decision.allowed) {
                findings.push(makeFinding(id++, change, decision, role));
            } else if (resolveRule(compiled, change, 'publish').value === 'review') {
                publishReview = true;
            }
        }
    }

    if (policy.correctness?.validate && !validated) {
        findings.push({
            id: `validate-${id++}`,
            source: 'validate',
            severity: 'review',
            ruleId: 'correctness.validate',
            message:
                'Candidate was not validated (correctness.validate is on and no validation result was provided)',
            suggestion: 'Run `jay-stack validate` on the candidate and pass --validated',
            role,
        });
    }

    const disposition = dispositionFrom(findings, publishReview);
    findings.sort(
        (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            (a.path ?? '').localeCompare(b.path ?? '') ||
            a.ruleId.localeCompare(b.ruleId),
    );

    return { disposition, findings, changes, policyHash };
}
