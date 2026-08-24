import type { DesignAnalysisFinding, DesignAnalysisResult } from './run-design-analysis.js';

export function buildDesignAnalysisAgentPrompt(result: DesignAnalysisResult): string {
    const lines: string[] = [
        'Fix design-system validation findings in this Jay project.',
        '',
        `Scanned ${result.filesScanned} .jay-html file(s).`,
        `Errors: ${result.errorCount}, warnings: ${result.warningCount}.`,
        '',
        'Use DESIGN.md tokens and component specs. Prefer design tokens over hardcoded CSS values.',
        '',
    ];

    if (result.findings.length === 0) {
        lines.push('No design-system findings — project conforms to DESIGN.md.');
        return lines.join('\n');
    }

    const byFile = new Map<string, DesignAnalysisFinding[]>();
    for (const finding of result.findings) {
        const group = byFile.get(finding.file) ?? [];
        group.push(finding);
        byFile.set(finding.file, group);
    }

    for (const [file, fileFindings] of byFile) {
        lines.push(`## ${file}`);
        for (const finding of fileFindings) {
            const prefix = finding.severity === 'error' ? 'ERROR' : 'WARN';
            lines.push(`- [${prefix}] (${finding.validator}) ${finding.message}`);
            if (finding.suggestion) {
                lines.push(`  Suggestion: ${finding.suggestion}`);
            }
        }
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}
