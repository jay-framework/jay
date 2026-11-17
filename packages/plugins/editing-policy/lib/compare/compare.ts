import { createHash } from 'crypto';
import { findDesignMd } from '@jay-framework/design-system-validator/design-tokens';
import { ADMIN_ROLE, DEFAULT_TEMPLATES_GLOB, PolicyFile } from '../policy/schema.js';
import { classifyChanges } from '../changes/classify.js';
import { Change, Tree } from '../changes/types.js';
import { CompareResult, Disposition, Finding } from './types.js';
import { CompiledRule, compileRole, decide, Decision, resolveRule } from './resolve.js';
import { designDiff, findMarkedSubtree, parsePage, ParsedPage } from '../semantic/regions.js';
import {
    verifyDesignSystemOnly,
    verifyFromTemplate,
    verifySync,
    Verdict,
} from '../semantic/verify.js';

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
    /**
     * On-disk roots of the two trees (DL#233). When present, the semantic verifiers (designSystemOnly
     * / from-template / sync) run and may upgrade a conservative `review` to allowed. Absent (e.g.
     * in-memory callers) → verifiers are skipped and the conservative DL#231 behavior stands.
     */
    baselineRoot?: string;
    candidateRoot?: string;
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
        lines: change.lines,
        message,
        suggestion,
        role,
    };
}

/** Rewrite a surviving finding's message/suggestion to reflect what the verifier actually found. */
function applyVerdictMessage(f: Finding, m: { message: string; suggestion: string }) {
    f.message = m.message;
    f.suggestion = m.suggestion;
}

function designSystemOnlyMessage(
    loc: string,
    verdict: Verdict,
): { message: string; suggestion: string } {
    if (verdict === 'fail') {
        return {
            message: `design change on ${loc} is not design-system-only — it re-themes or restructures a pre-existing element, or uses a non-token value`,
            suggestion:
                'Add design-system elements/tokens instead of editing existing elements, or request review from the designer',
        };
    }
    return {
        message: `design change on ${loc} could not be confirmed as design-system-only (no DESIGN.md, or it uses class names that can't be checked)`,
        suggestion:
            'Add a DESIGN.md with the design tokens and use token values, or request review from the designer',
    };
}

function fromTemplateMessage(
    path: string,
    verdict: Verdict,
): { message: string; suggestion: string } {
    if (verdict === 'fail') {
        return {
            message: `new ${path} is not built from a template`,
            suggestion:
                'Build the page/section from a template region (import one with template= and flatten it via `jay-stack sync`), or request review',
        };
    }
    return {
        message: `new ${path} could not be confirmed as built from a template`,
        suggestion: 'Ensure the new page flattens a template region (template=), or request review',
    };
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { block: 0, review: 1, info: 2 };

function dispositionFrom(findings: Finding[], publishReview: boolean): Disposition {
    if (findings.some((f) => f.severity === 'block')) return 'BLOCK';
    if (publishReview || findings.some((f) => f.severity === 'review')) return 'REVIEW';
    return 'PUBLISH';
}

interface RuleEntry {
    finding: Finding;
    change: Change;
}

/**
 * Compare a baseline and candidate tree under a role (DL#231 §6.3 + DL#233 semantic verification).
 * Pure: no git, install, or network (the verifiers read jay-html/templates/DESIGN.md from the two
 * directories). Throws {@link PolicyToolError} for an unknown role or when neither a role nor
 * `defaultRole` is set.
 */
export async function comparePolicy(input: ComparePolicyInput): Promise<CompareResult> {
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

    const ruleEntries: RuleEntry[] = [];
    let publishReview = false;
    let id = 0;
    let compiled: CompiledRule[] = [];

    if (!isAdmin) {
        compiled = compileRole(policy.roles[role]);
        for (const change of changes) {
            const decision = decide(compiled, change);
            if (!decision.allowed) {
                ruleEntries.push({ finding: makeFinding(id++, change, decision, role), change });
            } else if (resolveRule(compiled, change, 'publish').value === 'review') {
                publishReview = true;
            }
        }
    }

    // DL#233 — semantic upgrade pass: turn conservative review/no findings into allowed when provable.
    const templatesGlobs =
        policy.templates && policy.templates.length > 0
            ? policy.templates
            : [DEFAULT_TEMPLATES_GLOB];
    const { survivors, upgradedPublishReview } = await applySemanticUpgrades(
        ruleEntries,
        input,
        compiled,
        templatesGlobs,
    );
    publishReview = publishReview || upgradedPublishReview;

    const findings: Finding[] = survivors;
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

/**
 * DL#233: for each conservative rule finding, run the matching verifier (sync / designSystemOnly /
 * from-template). A proven-safe change is dropped from the findings (allowed); its `publish` rule is
 * then honored so an allowed-but-review-on-publish change still routes to REVIEW. Needs the on-disk
 * roots — absent → nothing is upgraded (DL#231 conservative behavior stands).
 */
async function applySemanticUpgrades(
    entries: RuleEntry[],
    input: ComparePolicyInput,
    compiled: CompiledRule[],
    templatesGlobs: string[],
): Promise<{ survivors: Finding[]; upgradedPublishReview: boolean }> {
    const { baseline, candidate, baselineRoot, candidateRoot } = input;
    if (!candidateRoot)
        return { survivors: entries.map((e) => e.finding), upgradedPublishReview: false };

    const pageCache = new Map<string, ParsedPage | null>();
    const parseCached = async (
        side: 'base' | 'cand',
        root: string | undefined,
        tree: Tree,
        p: string,
    ): Promise<ParsedPage | null> => {
        if (!root) return null;
        const key = `${side}:${p}`;
        if (!pageCache.has(key)) {
            let content: string | undefined;
            try {
                content = tree.read(p);
            } catch {
                content = undefined;
            }
            pageCache.set(key, content === undefined ? null : await parsePage(content, p, root));
        }
        return pageCache.get(key) ?? null;
    };

    const survivors: Finding[] = [];
    let upgradedPublishReview = false;

    for (const { finding: f, change } of entries) {
        let upgraded = false;

        if (f.path?.endsWith('.jay-html') || change.kind === 'create') {
            // sync — a re-flatten of a marked region beats any design-rule finding (DL#231 Q10)
            if (!upgraded && f.ruleId.startsWith('design:') && f.section) {
                const cand = await parseCached('cand', candidateRoot, candidate, f.path!);
                if (cand && (await verifySync(cand, f.section, candidateRoot))) upgraded = true;
            }
            // designSystemOnly — additive + token-only
            if (!upgraded && f.ruleId.endsWith(':designSystemOnly')) {
                const base = await parseCached('base', baselineRoot, baseline, f.path!);
                const cand = await parseCached('cand', candidateRoot, candidate, f.path!);
                if (base && cand) {
                    const scopeBase = f.section
                        ? (findMarkedSubtree(base.body, f.section) ?? base.body)
                        : base.body;
                    const scopeCand = f.section
                        ? (findMarkedSubtree(cand.body, f.section) ?? cand.body)
                        : cand.body;
                    const tokens = findDesignMd(f.path!, candidateRoot)?.tokens;
                    const verdict = verifyDesignSystemOnly(
                        designDiff(scopeBase, scopeCand),
                        tokens,
                    );
                    if (verdict === 'pass') upgraded = true;
                    else applyVerdictMessage(f, designSystemOnlyMessage(where(change), verdict));
                }
            }
            // create: from-template
            if (!upgraded && f.ruleId.endsWith(':from-template')) {
                const cand = await parseCached('cand', candidateRoot, candidate, f.path!);
                if (cand) {
                    const verdict = verifyFromTemplate(cand, templatesGlobs);
                    if (verdict === 'pass') upgraded = true;
                    else applyVerdictMessage(f, fromTemplateMessage(change.path, verdict));
                }
            }
        }

        if (upgraded) {
            if (resolveRule(compiled, change, 'publish').value === 'review')
                upgradedPublishReview = true;
        } else {
            survivors.push(f);
        }
    }

    return { survivors, upgradedPublishReview };
}
