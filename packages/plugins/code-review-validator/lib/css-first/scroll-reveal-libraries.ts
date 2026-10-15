/** Shared list for markup, import, and script-src halves of allow-scroll-reveal-library. */
export const SCROLL_REVEAL_IMPORT_SPECIFIERS = ['aos', 'wow.js', 'wowjs', 'scrollreveal'] as const;

/** Exact attribute names or prefixes (not broad regexes that match unrelated data-* attrs). */
export const SCROLL_REVEAL_ATTRIBUTES = [
    'data-aos',
    'data-sr',
    'data-sr-id',
] as const;

const SCROLL_REVEAL_ATTRIBUTE_PREFIXES = ['data-aos-', 'data-wow-'] as const;

function isBarePackageSpecifier(specifier: string): boolean {
    const normalized = specifier.replace(/\\/g, '/').trim();
    if (!normalized || normalized.startsWith('.') || normalized.startsWith('/')) {
        return false;
    }
    if (normalized.includes('://')) return false;
    const segment = normalized.split('/')[0] ?? '';
    return segment.length > 0 && !segment.startsWith('.');
}

export function matchesScrollRevealImport(specifier: string): boolean {
    if (!isBarePackageSpecifier(specifier)) {
        return false;
    }
    const packageName = specifier.replace(/\\/g, '/').trim().split('/')[0]?.toLowerCase() ?? '';
    return SCROLL_REVEAL_IMPORT_SPECIFIERS.some(
        (entry) => packageName === entry || packageName === entry.replace('.js', ''),
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

export function matchesScrollRevealScriptSrc(src: string): boolean {
    if (!src.trim()) {
        return false;
    }
    return scriptSrcPathSegments(src).some(segmentMatchesScrollRevealScript);
}

export function matchesScrollRevealAttribute(name: string): boolean {
    const lower = name.toLowerCase();
    if ((SCROLL_REVEAL_ATTRIBUTES as readonly string[]).includes(lower)) {
        return true;
    }
    return SCROLL_REVEAL_ATTRIBUTE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
