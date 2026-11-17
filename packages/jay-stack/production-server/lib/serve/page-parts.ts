import type { RouteEntry } from '../types';
import type { ArtifactStore } from './artifact-store';
import {
    loadPagePartsFromConfig,
    type ProductionPageParts,
} from '../builder/load-production-parts';
import { pagePartsConfigPath } from '../shared/instance-key';

const pagePartsCache = new Map<string, ProductionPageParts>();

/**
 * Page parts (components + headless instances) of a route, loaded from its `page-parts.json` and
 * cached per route pattern. Shared by request serving and slow-render refresh / render-on-miss.
 */
export async function getPageParts(
    route: Pick<RouteEntry, 'pattern'>,
    artifacts: ArtifactStore,
): Promise<ProductionPageParts> {
    const cached = pagePartsCache.get(route.pattern);
    if (cached) return cached;
    const parts = await loadPagePartsFromConfig(pagePartsConfigPath(route.pattern), artifacts);
    pagePartsCache.set(route.pattern, parts);
    return parts;
}

/** Test helper: forget cached page parts. */
export function clearPagePartsCache(): void {
    pagePartsCache.clear();
}
