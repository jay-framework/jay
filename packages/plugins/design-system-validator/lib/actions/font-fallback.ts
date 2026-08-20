import { makeJayAction } from '@jay-framework/fullstack-component';
import { fontFamilyToCamelCase } from '@capsizecss/metrics';
import { createFontStack, type FontMetrics } from '@capsizecss/core';

interface FontFallbackInput {
    primary: string;
    fallback: string;
}

interface FontFallbackOutput {
    fontFamily: string;
    fontFaces: string;
}

async function loadMetrics(familyName: string): Promise<FontMetrics> {
    const camelCase = fontFamilyToCamelCase(familyName);
    try {
        const mod = await import(`@capsizecss/metrics/${camelCase}`);
        return mod.default as FontMetrics;
    } catch {
        throw new Error(
            `Font "${familyName}" not found in @capsizecss/metrics. ` +
                `Use a known Google Font or system font name (e.g. "Inter", "Arial", "Georgia").`,
        );
    }
}

export const fontFallback = makeJayAction('designSystem.fontFallback').withHandler(
    async (input: FontFallbackInput): Promise<FontFallbackOutput> => {
        const primaryMetrics = await loadMetrics(input.primary);
        const fallbackMetrics = await loadMetrics(input.fallback);

        const result = createFontStack([primaryMetrics, fallbackMetrics]);

        return {
            fontFamily: result.fontFamily,
            fontFaces: result.fontFaces,
        };
    },
);
