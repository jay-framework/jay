/**
 * Tool Description Loader — reads .jay-contract files and extracts
 * descriptions for interactive tags.
 *
 * Descriptions are loaded from contract YAML at runtime (not embedded
 * in the HTML/JS bundle) so the cost is only paid when the AI agent
 * is present.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { getLogger } from '@jay-framework/logger';

export interface ToolDescription {
    refName: string;
    description: string;
}

interface PluginsIndex {
    plugins: Array<{
        name: string;
        path: string;
        contracts: Array<{ name: string; type: string; path: string }>;
    }>;
}

interface ParsedTag {
    tag: string;
    type?: string | string[];
    description?: string | string[];
    tags?: ParsedTag[];
}

interface ParsedContract {
    name?: string;
    tags?: ParsedTag[];
}

const INTERACTIVE_TYPE = 'interactive';

/**
 * Checks if a parsed tag is interactive (type contains 'interactive').
 */
function isInteractive(tag: ParsedTag): boolean {
    if (!tag.type) return false;
    if (typeof tag.type === 'string') return tag.type === INTERACTIVE_TYPE;
    if (Array.isArray(tag.type)) return tag.type.includes(INTERACTIVE_TYPE);
    return false;
}

/**
 * Extracts the description string from a tag's description field.
 * Handles both string and array-of-strings formats.
 */
function extractDescription(desc: string | string[] | undefined): string | undefined {
    if (!desc) return undefined;
    if (typeof desc === 'string') return desc;
    if (Array.isArray(desc)) return desc.join(' ');
    return undefined;
}

/**
 * Recursively walks a tag tree and collects descriptions for interactive tags.
 * Uses leaf description only (no parent concatenation).
 */
function collectInteractiveDescriptions(tags: ParsedTag[]): ToolDescription[] {
    const result: ToolDescription[] = [];

    for (const tag of tags) {
        if (isInteractive(tag)) {
            const desc = extractDescription(tag.description);
            if (desc) {
                result.push({ refName: tag.tag, description: desc });
            }
        }

        // Recurse into sub-contract tags
        if (tag.tags) {
            result.push(...collectInteractiveDescriptions(tag.tags));
        }
    }

    return result;
}

/** Cached result — descriptions don't change at runtime. */
let cachedDescriptions: ToolDescription[] | null = null;

/**
 * Loads tool descriptions from all .jay-contract files referenced in
 * plugins-index.yaml. Results are cached in memory after the first call.
 */
export function loadToolDescriptions(projectRoot: string): ToolDescription[] {
    if (cachedDescriptions) return cachedDescriptions;

    const log = getLogger();
    const descriptions: ToolDescription[] = [];

    const indexPath = path.join(projectRoot, 'agent-kit', 'plugins-index.yaml');

    if (!fs.existsSync(indexPath)) {
        log.info('[gemini-agent] No plugins-index.yaml found, skipping tool descriptions');
        cachedDescriptions = descriptions;
        return descriptions;
    }

    try {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        const pluginsIndex = yaml.load(indexContent) as PluginsIndex;

        if (!pluginsIndex?.plugins) {
            cachedDescriptions = descriptions;
            return descriptions;
        }

        for (const plugin of pluginsIndex.plugins) {
            for (const contract of plugin.contracts || []) {
                const contractPath = path.resolve(projectRoot, contract.path);

                if (!fs.existsSync(contractPath)) {
                    log.info(`[gemini-agent] Contract file not found: ${contractPath}, skipping`);
                    continue;
                }

                try {
                    const contractContent = fs.readFileSync(contractPath, 'utf-8');
                    const parsed = yaml.load(contractContent) as ParsedContract;

                    if (parsed?.tags) {
                        descriptions.push(...collectInteractiveDescriptions(parsed.tags));
                    }
                } catch (err: any) {
                    log.warn(
                        `[gemini-agent] Failed to parse contract ${contractPath}: ${err.message}`,
                    );
                }
            }
        }

        log.info(`[gemini-agent] Loaded ${descriptions.length} tool descriptions from contracts`);
    } catch (err: any) {
        log.warn(`[gemini-agent] Failed to load plugins-index.yaml: ${err.message}`);
    }

    cachedDescriptions = descriptions;
    return descriptions;
}

/**
 * Resets the cached descriptions. Used for testing.
 */
export function resetToolDescriptionsCache(): void {
    cachedDescriptions = null;
}
