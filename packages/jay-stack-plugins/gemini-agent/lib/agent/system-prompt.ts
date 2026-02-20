/**
 * System Prompt Builder — constructs the system prompt for Gemini.
 *
 * Page state is compacted (no pretty-printing, truncated arrays/strings)
 * to reduce token usage. Tool summaries replace per-tool schema details.
 */

const MAX_ARRAY_ITEMS = 3;
const MAX_STRING_LENGTH = 200;

/**
 * Recursively compacts a page state object to reduce token usage:
 * - Arrays longer than 3 items are truncated with a count suffix
 * - Strings longer than 200 chars are truncated with ellipsis
 */
export function compactPageState(value: unknown): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        if (value.length > MAX_STRING_LENGTH) {
            return value.slice(0, MAX_STRING_LENGTH) + '...';
        }
        return value;
    }

    if (Array.isArray(value)) {
        if (value.length > MAX_ARRAY_ITEMS) {
            const truncated = value.slice(0, MAX_ARRAY_ITEMS).map(compactPageState);
            truncated.push(`... (${value.length} total)`);
            return truncated;
        }
        return value.map(compactPageState);
    }

    if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = compactPageState(v);
        }
        return result;
    }

    return value;
}

/**
 * Builds the system prompt for a Gemini conversation turn.
 *
 * The prompt includes:
 * 1. Custom prefix (from config) or default greeting
 * 2. Current page state as compact JSON context
 * 3. Tool summary list
 * 4. Instructions for tool use and discovery
 */
export function buildSystemPrompt(
    pageState: object,
    toolSummary: string,
    customPrefix?: string,
): string {
    const compacted = compactPageState(pageState);

    const parts: string[] = [
        customPrefix || 'You are a helpful assistant for this web application.',
        '',
        '## Current Page State',
        JSON.stringify(compacted),
        '',
    ];

    if (toolSummary) {
        parts.push('## Available Tools');
        parts.push(toolSummary);
        parts.push('');
    }

    parts.push(
        'You can interact with the page using the tools listed above.',
        'Before using any tool, call `get_tool_details` with the tool names to discover and enable them.',
        'The page state above is a compact summary. Call `get_page_state` for the full untruncated state when needed.',
        'After using tools, describe what you did to the user.',
        'The page state is refreshed each turn — use it to understand what the user sees.',
    );

    return parts.join('\n');
}
