import { CompareResult, Finding } from '../compare/types.js';
import { Change } from '../changes/types.js';

export interface RenderMeta {
    role: string;
    baselineLabel?: string;
    candidateLabel?: string;
}

function loc(f: Finding | Change): string {
    const section = 'section' in f ? f.section : undefined;
    const path = 'path' in f ? f.path : undefined;
    return section ? `${path}#${section}` : (path ?? '');
}

const SEV_WORD: Record<Finding['severity'], string> = {
    block: 'BLOCK',
    review: 'REVIEW',
    info: 'INFO',
};

/** Render a {@link CompareResult} as the stable markdown report (DL#231 §6.3.1). */
export function renderMarkdown(result: CompareResult, meta: RenderMeta): string {
    const lines: string[] = [];
    lines.push(`# Policy comparison: ${result.disposition}`);

    const subtitle = [`Role: ${meta.role}`];
    if (meta.baselineLabel) subtitle.push(`Baseline: ${meta.baselineLabel}`);
    if (meta.candidateLabel) subtitle.push(`Candidate: ${meta.candidateLabel}`);
    subtitle.push(`Policy hash: ${result.policyHash.slice(0, 8)}`);
    lines.push(subtitle.join(' · '));
    lines.push('');

    lines.push(`## Findings (${result.findings.length})`);
    for (const f of result.findings) {
        lines.push(`### ${SEV_WORD[f.severity]} — ${f.ruleId}`);
        const ref = [`\`${loc(f)}\``, `role \`${f.role}\``];
        if (f.selector) ref.push(`selector \`${f.selector}\``);
        lines.push(ref.join(' · '));
        lines.push(f.message);
        if (f.suggestion) lines.push(`Suggestion: ${f.suggestion}`);
        lines.push('');
    }

    lines.push(`## Changes (${result.changes.length})`);
    for (const c of result.changes) {
        lines.push(`- ${c.kind}: \`${loc(c)}\` — ${c.summary}`);
    }
    lines.push('');

    // Point the reading agent at the guide for acting on this report (copied into a consumer project by
    // `jay-stack agent-kit`).
    lines.push('---');
    lines.push(
        'How to act on this report: see `agent-kit/designer/handling-policy-feedback.md`.',
    );
    lines.push('');

    return lines.join('\n');
}

/** Render a {@link CompareResult} as JSON (same disposition/findings/changes as the markdown). */
export function renderJson(result: CompareResult): string {
    return JSON.stringify(result, null, 2);
}
