import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    let hasH1 = false;
    let h1Count = 0;
    let lastHeadingLevel = 0;
    let hasMain = false;
    let hasImage = false;
    let hasFetchPriorityHigh = false;

    walkElements(ctx.body, ctx, (el) => {
        const tag: string | undefined = el.rawTagName?.toLowerCase();
        if (!tag) return;

        // --- Rule: img must have alt ---
        if (tag === 'img') {
            hasImage = true;
            if (el.getAttribute?.('fetchpriority') === 'high') {
                hasFetchPriorityHigh = true;
            }

            const alt = el.getAttribute?.('alt');
            if (alt === undefined || alt === null) {
                findings.push({
                    severity: 'warning',
                    message: 'Image missing alt attribute — hurts SEO and accessibility',
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
                        message: 'Image missing explicit dimensions — causes layout shift (CLS)',
                        suggestion:
                            'Add width and height attributes to prevent Cumulative Layout Shift. ' +
                            'Example: <img width="800" height="600" ... />. ' +
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
                    message:
                        'Image without loading attribute — consider lazy loading for performance',
                    suggestion:
                        'Add loading="lazy" to defer off-screen images. ' +
                        'Use loading="eager" only for above-the-fold images.',
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
            message: 'Page has no <main> landmark — helps search engines identify primary content',
            suggestion:
                'Wrap the primary page content in a <main> element. ' +
                'Each page should have one <main> landmark.',
            element: '<main>',
        });
    }

    if (hasImage && !hasFetchPriorityHigh) {
        findings.push({
            severity: 'warning',
            message: 'No image has fetchpriority="high" — the LCP image should be prioritized',
            suggestion:
                'Add fetchpriority="high" to the largest above-the-fold image (the LCP candidate). ' +
                'This tells the browser to download it first, improving Largest Contentful Paint.',
            element: '<img>',
            attribute: 'fetchpriority',
        });
    }

    // --- Head metadata checks ---
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
        if (robotsContent && /noindex/i.test(robotsContent)) {
            findings.push({
                severity: 'warning',
                message:
                    'Page has <meta name="robots" content="noindex"> — it will not appear in search results',
                suggestion:
                    'Remove noindex from the robots meta tag if this page should be indexed. ' +
                    'If intentional (e.g. admin pages), this warning can be ignored.',
                element: '<meta>',
                attribute: 'content',
            });
        }
    }

    return findings;
};
