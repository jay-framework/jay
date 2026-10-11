import fs from 'node:fs/promises';
import path from 'node:path';
import { headMetaToHeadTags } from '@jay-framework/stack-server-runtime';
import type { RouteManifest, RouteEntry } from '../types';
import { buildUrlFromManifest } from './generate-sitemap';

/**
 * Site identity used for the llms.txt header (DL#214). Mirrors the `.jay` `site` config subset
 * that `generateSiteJsonLd` consumes.
 */
export interface LlmsTxtSiteConfig {
    name?: string;
    description?: string;
    baseUrl?: string;
}

interface PageLink {
    title: string;
    url: string;
    description?: string;
}

/** An unresolved `{binding}` leftover (a bound headMeta part with no matching slow ViewState). */
const UNRESOLVED_BINDING = /\{[A-Za-z_$][\w$]*(?:\.[\w$]+)*\}/;

function hasUnresolved(value: string | undefined): boolean {
    return !!value && UNRESOLVED_BINDING.test(value);
}

/** Load an instance's slow ViewState from its (backend-relative) cache path. {} when unreadable. */
async function loadSlowViewState(backendDir: string, cachePath: string): Promise<object> {
    try {
        const raw = await fs.readFile(path.join(backendDir, cachePath), 'utf8');
        return JSON.parse(raw).slowViewState ?? {};
    } catch {
        return {};
    }
}

/** Resolve a route's headMeta (against an instance's slow ViewState) into title + description. */
function resolveTitleAndDescription(
    route: RouteEntry,
    viewState: object,
): { title?: string; description?: string } {
    const tags = headMetaToHeadTags(route.headMeta, viewState);
    const titleTag = tags.find((t) => t.tag.toLowerCase() === 'title');
    const descTag = tags.find(
        (t) => t.tag.toLowerCase() === 'meta' && t.attrs?.name === 'description',
    );
    const title = hasUnresolved(titleTag?.children) ? undefined : titleTag?.children;
    const description = hasUnresolved(descTag?.attrs?.content)
        ? undefined
        : descTag?.attrs?.content;
    return { title, description };
}

/** Collect the indexable page links from the manifest (skips devOnly + noIndex). */
async function collectPageLinks(
    manifest: RouteManifest,
    base: string,
    backendDir: string,
): Promise<PageLink[]> {
    const links: PageLink[] = [];

    for (const route of manifest.routes) {
        if (route.devOnly || route.noIndex) continue;

        if (route.instances.length === 0) {
            const hasDynamic = route.segments.some((s) => s.type !== 'static');
            if (hasDynamic) continue; // dynamic route with no built instances — nothing to list
            const urlPath = route.pattern === '/' ? '/' : route.pattern;
            const { title, description } = resolveTitleAndDescription(route, {});
            links.push({ title: title ?? urlPath, url: `${base}${urlPath}`, description });
            continue;
        }

        for (const instance of route.instances) {
            const urlPath = buildUrlFromManifest(route.pattern, instance.params);
            const viewState = await loadSlowViewState(backendDir, instance.cachePath);
            const { title, description } = resolveTitleAndDescription(route, viewState);
            links.push({ title: title ?? urlPath, url: `${base}${urlPath}`, description });
        }
    }

    return links;
}

/** Group page links by their top-level path segment (for `##` sections when there are many). */
function sectionOf(url: string, base: string): string {
    const pathOnly = url.startsWith(base) ? url.slice(base.length) : url;
    const seg = pathOnly.replace(/^\//, '').split('/')[0];
    return seg || 'Home';
}

/**
 * Generate an `llms.txt` (llmstxt.org) index from the build manifest + site config (DL#214).
 * A curated, markdown map of the site for LLMs: site H1 + summary, then per-page links with
 * descriptions, grouped into `##` sections by top-level path segment.
 *
 * Returns the number of page links written. Requires `site.name` (the H1); callers skip the
 * emission when it is absent (parallel to the sitemap requiring `baseUrl`).
 */
export async function generateLlmsTxt(
    manifest: RouteManifest,
    site: LlmsTxtSiteConfig,
    backendDir: string,
    outputPath: string,
): Promise<number> {
    const base = (site.baseUrl ?? '').replace(/\/$/, '');
    const links = await collectPageLinks(manifest, base, backendDir);

    const lines: string[] = [`# ${site.name}`, ''];
    if (site.description) {
        lines.push(`> ${site.description}`, '');
    }

    // Group by top-level section, preserving first-seen section order.
    const bySection = new Map<string, PageLink[]>();
    for (const link of links) {
        const section = sectionOf(link.url, base);
        const bucket = bySection.get(section) ?? [];
        bucket.push(link);
        bySection.set(section, bucket);
    }

    for (const [section, bucket] of bySection) {
        lines.push(`## ${section}`, '');
        for (const link of bucket) {
            const suffix = link.description ? `: ${link.description}` : '';
            lines.push(`- [${link.title}](${link.url})${suffix}`);
        }
        lines.push('');
    }

    const tmpPath = outputPath + '.tmp';
    await fs.writeFile(tmpPath, lines.join('\n').replace(/\n+$/, '\n'));
    await fs.rename(tmpPath, outputPath);

    return links.length;
}
