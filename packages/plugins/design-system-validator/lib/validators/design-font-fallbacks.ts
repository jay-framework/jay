import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
    JayHtmlHeadMeta,
} from '@jay-framework/compiler-shared';
import postcss, { type AtRule } from 'postcss';
import { findDesignMd } from '../parse-design-md.js';

const GUIDE_SUGGESTION =
    'See design-system-validator agent-kit/designer/font-fallback-patterns.md for usage guide';

const METRIC_OVERRIDE_PROPERTIES = new Set([
    'size-adjust',
    'ascent-override',
    'descent-override',
    'line-gap-override',
]);

interface FontFaceInfo {
    family: string;
    hasUrlSrc: boolean;
    hasLocalSrc: boolean;
    hasMetricOverrides: boolean;
}

function unquote(value: string): string {
    return value.replace(/^(['"])(.*)\1$/, '$2');
}

function parseFontFaces(css: string): FontFaceInfo[] {
    const result: FontFaceInfo[] = [];
    const root = postcss.parse(css);

    root.walkAtRules('font-face', (atRule: AtRule) => {
        let family = '';
        let hasUrlSrc = false;
        let hasLocalSrc = false;
        let hasMetricOverrides = false;

        atRule.walkDecls((decl) => {
            if (decl.prop === 'font-family') {
                family = unquote(decl.value);
            }
            if (decl.prop === 'src') {
                if (/url\s*\(/.test(decl.value)) hasUrlSrc = true;
                if (/local\s*\(/.test(decl.value)) hasLocalSrc = true;
            }
            if (METRIC_OVERRIDE_PROPERTIES.has(decl.prop)) {
                hasMetricOverrides = true;
            }
        });

        if (family) {
            result.push({ family, hasUrlSrc, hasLocalSrc, hasMetricOverrides });
        }
    });

    return result;
}

const FONT_SERVICE_HOSTS = [
    'fonts.googleapis.com',
    'fonts.bunny.net',
    'fonts.cdnfonts.com',
    'use.typekit.net',
];

function parseFontServiceUrl(url: string): string[] {
    if (!FONT_SERVICE_HOSTS.some((host) => url.includes(host))) return [];

    const queryStart = url.indexOf('?');
    if (queryStart === -1) return [];
    const query = url.substring(queryStart + 1);

    const families: string[] = [];
    for (const param of query.split('&')) {
        const eqIdx = param.indexOf('=');
        const key = eqIdx === -1 ? param : param.substring(0, eqIdx);
        const value = eqIdx === -1 ? '' : param.substring(eqIdx + 1);

        if (key === 'family') {
            // v1: family=Open+Sans:400,700|Roboto:300  (pipe-separated)
            // v2: family=Open+Sans:wght@400;700        (one per param)
            const parts = value.split('|');
            for (const part of parts) {
                const name = decodeURIComponent(part.split(':')[0]).replace(/\+/g, ' ');
                if (name) families.push(name);
            }
        }
    }

    return families;
}

function parseFontImports(css: string): string[] {
    const families: string[] = [];
    const root = postcss.parse(css);

    root.walkAtRules('import', (atRule: AtRule) => {
        const raw = atRule.params;
        const urlMatch = raw.match(/url\s*\(\s*(['"]?)(.+?)\1\s*\)/) || raw.match(/(['"]?)(.+?)\1/);
        if (!urlMatch) return;
        const url = urlMatch[2];
        families.push(...parseFontServiceUrl(url));
    });

    return families;
}

function parseFontLinks(head: JayHtmlHeadMeta | undefined): string[] {
    if (!head?.links) return [];

    const families: string[] = [];
    for (const link of head.links) {
        if (link.rel !== 'stylesheet') continue;
        const staticParts = link.href.filter((p) => p.kind === 'static');
        if (staticParts.length !== link.href.length) continue;
        const url = staticParts.map((p) => p.value).join('');
        families.push(...parseFontServiceUrl(url));
    }

    return families;
}

function parseFontFamilyStacks(css: string): Map<string, string[]> {
    const stacks = new Map<string, string[]>();
    const root = postcss.parse(css);

    root.walkDecls('font-family', (decl) => {
        const parent = decl.parent;
        if (parent?.type === 'atrule' && (parent as AtRule).name === 'font-face') return;

        const families = decl.value.split(',').map((f) => unquote(f.trim()));
        const key = families.join(',');
        if (!stacks.has(key)) {
            stacks.set(key, families);
        }
    });

    return stacks;
}

export const validateFontFallbacks: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    const fontFaces = ctx.css ? parseFontFaces(ctx.css) : [];
    const importedFonts = ctx.css ? parseFontImports(ctx.css) : [];
    const linkedFonts = parseFontLinks(ctx.head);

    if (fontFaces.length === 0 && importedFonts.length === 0 && linkedFonts.length === 0)
        return findings;
    if (!ctx.css && linkedFonts.length === 0) return findings;

    const webFontFamilies = new Set<string>();
    const metricMatchedFallbacks = new Set<string>();

    for (const ff of fontFaces) {
        if (ff.hasUrlSrc) {
            webFontFamilies.add(ff.family);
        }
        if (ff.hasLocalSrc && ff.hasMetricOverrides) {
            metricMatchedFallbacks.add(ff.family);
        }
    }

    for (const family of importedFonts) {
        webFontFamilies.add(family);
    }

    for (const family of linkedFonts) {
        webFontFamilies.add(family);
    }

    if (webFontFamilies.size === 0) return findings;

    const fontStacks = ctx.css ? parseFontFamilyStacks(ctx.css) : new Map<string, string[]>();

    const designMd = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (designMd) {
        for (const [, token] of Object.entries(designMd.tokens.typography)) {
            if (token.fontFamily) {
                const families = token.fontFamily.split(',').map((f) => unquote(f.trim()));
                const key = families.join(',');
                if (!fontStacks.has(key)) {
                    fontStacks.set(key, families);
                }
            }
        }
    }

    const flagged = new Set<string>();

    function flagIfMissing(family: string): void {
        if (flagged.has(family)) return;

        const hasFallbackFace = fontFaces.some(
            (ff) =>
                ff.hasLocalSrc &&
                ff.hasMetricOverrides &&
                ff.family.startsWith(family) &&
                ff.family !== family,
        );

        const familyItselfIsMetricMatched = metricMatchedFallbacks.has(family);

        if (!hasFallbackFace && !familyItselfIsMetricMatched) {
            flagged.add(family);
            findings.push({
                severity: 'warning',
                message: `font-family "${family}" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.`,
                suggestion: `Generate a fallback with: npx jay-stack-cli action design-system-validator/fontFallback --input '{"primary":"${family}","fallback":"Arial"}'`,
            });
        }
    }

    for (const [, families] of fontStacks) {
        for (const family of families) {
            if (!webFontFamilies.has(family)) continue;
            flagIfMissing(family);
        }
    }

    for (const family of webFontFamilies) {
        flagIfMissing(family);
    }

    if (findings.length > 0) {
        findings.push({ severity: 'warning', message: '', suggestion: GUIDE_SUGGESTION });
    }

    return findings;
};
