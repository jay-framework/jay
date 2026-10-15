/** Shared list for markup, import, and script-src halves of allow-scroll-reveal-library. */
export const SCROLL_REVEAL_IMPORT_SPECIFIERS = ['aos', 'wow.js', 'wowjs', 'scrollreveal'] as const;

export const SCROLL_REVEAL_ATTRIBUTES = [
    /^data-aos(?:-|$)/i,
    /^data-wow-/i,
    /^data-sr(?:-|$)/i,
] as const;

export function matchesScrollRevealImport(specifier: string): boolean {
    const normalized = specifier.replace(/\\/g, '/').toLowerCase();
    return SCROLL_REVEAL_IMPORT_SPECIFIERS.some(
        (entry) => normalized === entry || normalized.endsWith(`/${entry}`),
    );
}

function scriptSrcPathSegments(src: string): string[] {
    const normalized = src.replace(/\\/g, '/').toLowerCase().trim();
    const withoutQuery = normalized.split('?')[0]?.split('#')[0] ?? normalized;

    if (/^https?:\/\//.test(withoutQuery) || withoutQuery.startsWith('//')) {
        try {
            const url = new URL(
                withoutQuery.startsWith('//') ? `https:${withoutQuery}` : withoutQuery,
            );
            return url.pathname.split('/').filter((part) => part.length > 0);
        } catch {
            return withoutQuery.split('/').filter((part) => part.length > 0);
        }
    }

    return withoutQuery.split('/').filter((part) => part.length > 0);
}

/** 
 * Check if the segment matches a javascript scroll library.
 * Meaning the code is using javascript for scrolling and might use css for scrolling with better native support and performance.
 * Path segment or filename must match — not a substring anywhere in the URL. */
function segmentMatchesScrollRevealScript(segment: string): boolean {
    if (segment === 'aos' || /^aos(\.min)?\.js$/.test(segment) || /^aos@[\d.]/.test(segment)) {
        return true;
    }
    if (
        segment === 'wowjs' ||
        segment === 'wow.js' ||
        /^wow(\.min)?\.js$/.test(segment)
    ) {
        return true;
    }
    if (segment === 'scrollreveal' || /^scrollreveal(\.min)?\.js$/.test(segment)) {
        return true;
    }
    return false;
}

/**
 * Check if the script src matches a javascript scroll library.
 * Meaning the code is using javascript for scrolling and might use css for scrolling with better native support and performance.
 * Path segment or filename must match — not a substring anywhere in the URL.
 */
export function matchesScrollRevealScriptSrc(src: string): boolean {
    if (!src.trim()) {
        return false;
    }
    return scriptSrcPathSegments(src).some(segmentMatchesScrollRevealScript);
}

export function matchesScrollRevealAttribute(name: string): boolean {
    return SCROLL_REVEAL_ATTRIBUTES.some((pattern) => pattern.test(name));
}
