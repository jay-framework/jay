import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import * as fs from 'node:fs';
import * as path from 'node:path';

function isComponent(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.includes('/components/');
}

function isSuppressed(ctx: Parameters<JayHtmlValidatorFn>[0], rule: string): boolean {
    return ctx.validationOverrides?.seo?.[rule] === true;
}

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];
    const isComp = isComponent(ctx.filePath);

    let hasH1 = false;
    let h1Count = 0;
    let lastHeadingLevel = 0;
    let hasMain = false;
    const LARGE_IMAGE_THRESHOLD = 200;
    let hasLargeImage = false;
    let hasFetchPriorityHigh = false;

    walkElements(ctx.body, ctx, (el) => {
        const tag: string | undefined = el.rawTagName?.toLowerCase();
        if (!tag) return;

        // --- Rule: img must have alt ---
        if (tag === 'img') {
            const w = parseInt(el.getAttribute?.('width') || '', 10);
            const h = parseInt(el.getAttribute?.('height') || '', 10);
            const hasExplicitSize = !isNaN(w) && !isNaN(h);
            const isLarge =
                !hasExplicitSize || w >= LARGE_IMAGE_THRESHOLD || h >= LARGE_IMAGE_THRESHOLD;
            if (isLarge) hasLargeImage = true;

            if (el.getAttribute?.('fetchpriority') === 'high') {
                hasFetchPriorityHigh = true;
            }

            const alt = el.getAttribute?.('alt');
            const imgTag = el.outerHTML?.split('>')[0] + '>' || '<img>';

            if (alt === undefined || alt === null) {
                findings.push({
                    severity: 'warning',
                    message: `Image missing alt attribute: ${imgTag}`,
                    suggestion:
                        'Add an alt attribute with descriptive text. ' +
                        'For decorative images use alt="".',
                    element: '<img>',
                    attribute: 'alt',
                });
            }

            // --- Rule: img should have explicit dimensions (CLS) ---
            const width = el.getAttribute?.('width');
            const height = el.getAttribute?.('height');
            const srcset = el.getAttribute?.('srcset');
            if (!width || !height) {
                const style = el.getAttribute?.('style') || '';
                const hasInlineWidth = /width\s*:/.test(style);
                const hasInlineHeight = /height\s*:/.test(style);
                if ((!hasInlineWidth || !hasInlineHeight) && !srcset) {
                    findings.push({
                        severity: 'warning',
                        message: `Image missing explicit dimensions — causes layout shift (CLS): ${imgTag}`,
                        suggestion:
                            'Add width and height attributes to prevent Cumulative Layout Shift. ' +
                            'Example: <img width="800" height="600" ... />. ' +
                            'For small icons, add the actual size (e.g., width="20" height="20"). ' +
                            'For responsive images, use srcset with sizes. ' +
                            'CLS is a Core Web Vital that affects search ranking.',
                        element: '<img>',
                        attribute: 'width',
                    });
                }
            }

            // --- Rule: img should have loading="lazy" ---
            const loading = el.getAttribute?.('loading');
            if (!loading) {
                findings.push({
                    severity: 'warning',
                    message: `Image without loading attribute: ${imgTag}`,
                    suggestion:
                        'Add loading="lazy" for off-screen images, or loading="eager" for above-the-fold images. ' +
                        'Either value suppresses this warning.',
                    element: '<img>',
                    attribute: 'loading',
                });
            }
        }

        // --- Rule: a[href] should have meaningful content ---
        if (tag === 'a') {
            const href = el.getAttribute?.('href');
            const text = el.textContent?.trim();
            if (href && (!text || text.length === 0) && !el.querySelector?.('img')) {
                const ariaLabel = el.getAttribute?.('aria-label');
                if (!ariaLabel) {
                    findings.push({
                        severity: 'warning',
                        message:
                            'Anchor element has no visible text or aria-label — bad for SEO link signals',
                        suggestion:
                            'Add descriptive text content inside the <a> tag, or add an aria-label attribute.',
                        element: '<a>',
                        attribute: 'href',
                    });
                }
            }
        }

        if (tag === 'main') {
            hasMain = true;
        }

        // --- Rule: heading hierarchy ---
        const headingMatch = tag.match(/^h([1-6])$/);
        if (headingMatch) {
            const level = parseInt(headingMatch[1], 10);

            if (level === 1) {
                hasH1 = true;
                h1Count++;
            }

            if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
                findings.push({
                    severity: 'warning',
                    message: `Heading level skipped: <h${lastHeadingLevel}> followed by <h${level}>`,
                    suggestion:
                        `Use <h${lastHeadingLevel + 1}> instead of <h${level}> to maintain heading hierarchy. ` +
                        'Search engines use heading structure to understand content organization.',
                    element: `<h${level}>`,
                });
            }

            lastHeadingLevel = level;
        }
    });

    if (!isComp) {
        if (!hasH1) {
            findings.push({
                severity: 'warning',
                message: 'Page has no <h1> element — the primary heading is important for SEO',
                suggestion:
                    'Add an <h1> element with the main page title or topic. ' +
                    'Each page should have exactly one <h1>.',
                element: '<h1>',
            });
        } else if (h1Count > 1) {
            findings.push({
                severity: 'warning',
                message: `Page has ${h1Count} <h1> elements — should have exactly one`,
                suggestion:
                    'Keep only one <h1> for the primary page heading. ' +
                    'Use <h2> or lower for secondary headings.',
                element: '<h1>',
            });
        }

        if (!hasMain) {
            findings.push({
                severity: 'warning',
                message:
                    'Page has no <main> landmark — helps search engines identify primary content',
                suggestion:
                    'Wrap the primary page content in a <main> element. ' +
                    'Each page should have one <main> landmark.',
                element: '<main>',
            });
        }

        if (hasLargeImage && !hasFetchPriorityHigh) {
            const suppressLcp = isSuppressed(ctx, 'no-lcp-image');

            if (!suppressLcp) {
                findings.push({
                    severity: 'warning',
                    message:
                        'No image has fetchpriority="high" — the LCP image should be prioritized',
                    suggestion:
                        'Add fetchpriority="high" to the largest above-the-fold image (the LCP candidate). ' +
                        'This tells the browser to download it first, improving Largest Contentful Paint. ' +
                        'If this page has no LCP image (e.g. text-first hero), suppress with ' +
                        'seo: { no-lcp-image: true } in <script type="application/jay-validations">. ' +
                        'See agent-kit/designer/validation-guide.md',
                    element: '<img>',
                    attribute: 'fetchpriority',
                });
            }
        }
    }

    // --- Rule: no @import of external URLs in CSS ---
    const cssSources: Array<{ css: string; source: string }> = [];

    const styleBlocks = ctx.body.querySelectorAll?.('style') ?? [];
    for (const styleEl of styleBlocks) {
        const cssText = (styleEl as any).textContent || '';
        if (cssText) cssSources.push({ css: cssText, source: '<style>' });
    }

    const linkedFiles = ctx.body.querySelectorAll?.('link[rel="stylesheet"]') ?? [];
    for (const link of linkedFiles) {
        const href = (link as any).getAttribute?.('href');
        if (href && !href.startsWith('http')) {
            try {
                const dir = path.dirname(path.resolve(ctx.projectRoot, ctx.filePath));
                const cssPath = path.resolve(dir, href);
                const cssText = fs.readFileSync(cssPath, 'utf-8');
                cssSources.push({ css: cssText, source: href });
            } catch {
                // linked file not found — skip
            }
        }
    }

    for (const { css, source } of cssSources) {
        const importRegex = /@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])/g;
        let importMatch: RegExpExecArray | null;
        while ((importMatch = importRegex.exec(css)) !== null) {
            const url = importMatch[1] || importMatch[2];
            if (url.startsWith('https://') || url.startsWith('http://')) {
                if (!isSuppressed(ctx, 'allow-css-import')) {
                    findings.push({
                        severity: 'warning',
                        message: `CSS @import of external URL "${url}" creates a chained blocking request that delays page rendering`,
                        suggestion:
                            'Move this to a <link rel="stylesheet" href="..."> tag in the HTML <head> instead. ' +
                            'This allows the browser preload scanner to discover both resources in parallel. ' +
                            'If intentional, suppress with seo: { allow-css-import: true } in <script type="application/jay-validations">. ' +
                            'See agent-kit/designer/validation-guide.md',
                        element: source === '<style>' ? '<style>' : `<link href="${source}">`,
                    });
                }
            }
        }
    }

    // --- Head metadata checks (pages only) ---
    if (isComp) return findings;

    const componentHeadTags = new Set(
        ctx.headlessImports.flatMap((imp) => imp.providedHeadTags ?? []),
    );

    if (ctx.head) {
        if (!ctx.head.title && !componentHeadTags.has('title')) {
            findings.push({
                severity: 'warning',
                message: 'Page has no <title> element',
                suggestion:
                    'Add <title>Page Title</title> in <head>. ' +
                    'The title appears in search results and browser tabs.',
                element: '<title>',
            });
        }

        const hasDescription = ctx.head.meta.some((m) => m.name?.toLowerCase() === 'description');
        if (!hasDescription && !componentHeadTags.has('meta:description')) {
            findings.push({
                severity: 'warning',
                message: 'Page has no <meta name="description">',
                suggestion:
                    'Add <meta name="description" content="..."> in <head>. ' +
                    'Search engines use this for result snippets.',
                element: '<meta>',
                attribute: 'name',
            });
        }

        const canonical = ctx.head.links.find((l) => l.rel === 'canonical');
        if (canonical) {
            const hasBinding = canonical.href.some((p) => p.kind === 'binding');
            const hrefStr = canonical.href.map((p) => p.value).join('');
            if (!hrefStr.startsWith('http://') && !hrefStr.startsWith('https://') && !hasBinding) {
                findings.push({
                    severity: 'warning',
                    message: 'Canonical URL should be absolute',
                    suggestion:
                        'Change the canonical href to an absolute URL (e.g., https://example.com/page). ' +
                        'Relative canonicals may not be interpreted correctly by all search engines.',
                    element: '<link>',
                    attribute: 'href',
                });
            }
        }

        const robotsMeta = ctx.head.meta.find((m) => m.name?.toLowerCase() === 'robots');
        const robotsContent = robotsMeta?.content.map((p) => p.value).join('');
        if (
            robotsContent &&
            /noindex/i.test(robotsContent) &&
            !isSuppressed(ctx, 'allow-noindex')
        ) {
            findings.push({
                severity: 'warning',
                message:
                    'Page has <meta name="robots" content="noindex"> — it will not appear in search results',
                suggestion:
                    'Remove noindex from the robots meta tag if this page should be indexed. ' +
                    'If intentional, suppress with seo: { allow-noindex: true } in <script type="application/jay-validations">. ' +
                    'See agent-kit/designer/validation-guide.md',
                element: '<meta>',
                attribute: 'content',
            });
        }

        // --- Rule: external stylesheets should have preconnect ---
        const preconnectOrigins = new Set(
            ctx.head.links
                .filter((l) => l.rel === 'preconnect')
                .map((l) => {
                    try {
                        return new URL(l.href.map((p) => p.value).join('')).origin;
                    } catch {
                        return '';
                    }
                })
                .filter(Boolean),
        );

        const FONT_SERVICE_DOMAINS = ['fonts.googleapis.com', 'use.typekit.net'];

        for (const link of ctx.head.links) {
            if (link.rel !== 'stylesheet') continue;
            const href = link.href.map((p) => p.value).join('');
            if (!href.startsWith('http://') && !href.startsWith('https://')) continue;

            let origin: string;
            let hostname: string;
            try {
                const parsed = new URL(href);
                origin = parsed.origin;
                hostname = parsed.hostname;
            } catch {
                continue;
            }

            if (!preconnectOrigins.has(origin)) {
                findings.push({
                    severity: 'warning',
                    message: `External stylesheet from ${hostname} without <link rel="preconnect"> — delays resource discovery`,
                    suggestion:
                        `Add <link rel="preconnect" href="${origin}"> before the stylesheet in <head>. ` +
                        'Preconnect establishes the connection early, reducing load time.',
                    element: '<link>',
                    attribute: 'href',
                });
            }

            // --- Rule: font service URLs should include display=swap ---
            if (FONT_SERVICE_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))) {
                if (!href.includes('display=swap')) {
                    findings.push({
                        severity: 'warning',
                        message: `Font stylesheet from ${hostname} missing display=swap — blocks text rendering`,
                        suggestion:
                            'Add &display=swap to the font URL to avoid invisible text while fonts load. ' +
                            'Example: https://fonts.googleapis.com/css2?family=Inter&display=swap',
                        element: '<link>',
                        attribute: 'href',
                    });
                }
            }
        }
    }

    return findings;
};
