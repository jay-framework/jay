import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    let hasH1 = false;
    let h1Count = 0;
    let lastHeadingLevel = 0;

    walkElements(ctx.body, ctx, (el) => {
        const tag: string | undefined = el.rawTagName?.toLowerCase();
        if (!tag) return;

        // --- Rule: img must have alt ---
        if (tag === 'img') {
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
                    message: 'Image without loading attribute — consider lazy loading for performance',
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
                        message: 'Anchor element has no visible text or aria-label — bad for SEO link signals',
                        suggestion:
                            'Add descriptive text content inside the <a> tag, or add an aria-label attribute.',
                        element: '<a>',
                        attribute: 'href',
                    });
                }
            }
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

    return findings;
};
