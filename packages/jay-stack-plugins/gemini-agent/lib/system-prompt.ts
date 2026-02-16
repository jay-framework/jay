/**
 * System Prompt Builder — constructs the system prompt for Gemini.
 *
 * Page state and available server actions are included as context
 * (not tools), so the LLM always knows the current state without
 * wasting tool calls.
 */

export interface ServerActionSummary {
    name: string;
    description?: string;
}

/**
 * Builds the system prompt for a Gemini conversation turn.
 *
 * The prompt includes:
 * 1. Custom prefix (from config) or default greeting
 * 2. Current page state as JSON context
 * 3. List of available server actions with descriptions
 * 4. Instructions for tool use
 */
export function buildSystemPrompt(
    pageState: object,
    serverActions: ServerActionSummary[],
    customPrefix?: string,
): string {
    const parts: string[] = [
        customPrefix || 'You are a helpful assistant for this web application.',
        '',
        '## Current Page State',
        JSON.stringify(pageState, null, 2),
        '',
    ];

    if (serverActions.length > 0) {
        parts.push('## Available Server Actions');
        for (const action of serverActions) {
            parts.push(`- ${action.name}${action.description ? `: ${action.description}` : ''}`);
        }
        parts.push('');
    }

    parts.push(
        'Use the provided tools to interact with the page and call server actions.',
        'After using tools, describe what you did to the user.',
        'The page state above is refreshed each turn — use it to understand what the user sees.',
    );

    return parts.join('\n');
}
