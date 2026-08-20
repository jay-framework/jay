import { describe, it, expect } from 'vitest';
import { buildDesignAnalysisAgentPrompt } from '../lib/build-analysis-prompt.js';
import type { DesignAnalysisResult } from '../lib/run-design-analysis.js';

describe('buildDesignAnalysisAgentPrompt', () => {
    it('describes findings grouped by file for the agent', () => {
        const result: DesignAnalysisResult = {
            filesScanned: 2,
            errorCount: 0,
            warningCount: 1,
            findings: [
                {
                    file: 'src/pages/home/page.jay-html',
                    validator: 'design-tokens',
                    severity: 'warning',
                    message: 'Hardcoded color "#ff0000" for color not in design system',
                    suggestion: 'Use token {colors.error}',
                },
            ],
        };

        const prompt = buildDesignAnalysisAgentPrompt(result);

        expect(prompt).toMatch(/Scanned 2 .jay-html file/);
        expect(prompt).toMatch(/Errors: 0, warnings: 1/);
        expect(prompt).toMatch(/## src\/pages\/home\/page.jay-html/);
        expect(prompt).toMatch(/design-tokens/);
        expect(prompt).toMatch(/Use token \{colors.error\}/);
    });

    it('reports clean project when there are no findings', () => {
        const prompt = buildDesignAnalysisAgentPrompt({
            filesScanned: 3,
            errorCount: 0,
            warningCount: 0,
            findings: [],
        });

        expect(prompt).toMatch(/No design-system findings/);
    });
});
