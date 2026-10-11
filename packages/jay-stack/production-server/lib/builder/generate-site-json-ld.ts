import type { HeadTag } from '@jay-framework/fullstack-component';

/**
 * Site-level identity config that drives Organization + WebSite JSON-LD (DL#213).
 * Mirrors the `site` block of `.jay` config.
 */
export interface SiteJsonLdConfig {
    name?: string;
    baseUrl?: string;
    logo?: string;
    description?: string;
    sameAs?: string[];
}

/** Join a baseUrl with a possibly-relative path; absolute `logo` values pass through. */
function resolveUrl(baseUrl: string | undefined, value: string): string {
    if (/^https?:\/\//i.test(value)) return value;
    if (!baseUrl) return value;
    const base = baseUrl.replace(/\/$/, '');
    const rel = value.startsWith('/') ? value : `/${value}`;
    return `${base}${rel}`;
}

/**
 * Build the site-level `Organization` + `WebSite` JSON-LD head tags from `.jay` `site` config.
 *
 * Returns `[]` when `site.name` is absent — there is no identity to describe, and a validation
 * warning (DL#213 Part 5) nudges the author. Emitted once at build (next to the sitemap) and
 * carried on the RouteManifest so every served page gets identical site identity.
 */
export function generateSiteJsonLd(site: SiteJsonLdConfig | undefined): HeadTag[] {
    if (!site?.name) return [];

    const base = site.baseUrl?.replace(/\/$/, '');

    const organization: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: site.name,
    };
    if (base) organization.url = base;
    if (site.logo) organization.logo = resolveUrl(site.baseUrl, site.logo);
    if (site.description) organization.description = site.description;
    if (site.sameAs && site.sameAs.length > 0) organization.sameAs = site.sameAs;

    const website: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
    };
    if (base) website.url = base;

    return [
        {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: JSON.stringify(organization),
        },
        {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: JSON.stringify(website),
        },
    ];
}
