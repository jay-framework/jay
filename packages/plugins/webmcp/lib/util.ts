import type { ToolResult, ToolDescriptor, Agent } from './webmcp-types';

/**
 * Convert a camelCase string to kebab-case.
 * "removeBtn" → "remove-btn"
 */
export function toKebab(s: string): string {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert a camelCase refName to human-readable text.
 * "removeBtn" → "remove btn"
 */
export function toHumanReadable(s: string): string {
    return s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Parse a "/" separated coordinate string into a coordinate array.
 * "item-1/removeBtn" → ["item-1", "removeBtn"]
 */
export function parseCoordinate(s: string): string[] {
    return s.split('/');
}

/**
 * Build a JSON text result for tool responses.
 */
export function jsonResult(label: string, data: unknown): ToolResult {
    return {
        content: [{ type: 'text', text: `${label}\n${JSON.stringify(data, null, 2)}` }],
    };
}

/**
 * Build a plain text result for tool responses.
 */
export function textResult(text: string): ToolResult {
    return {
        content: [{ type: 'text', text }],
    };
}

/**
 * Build an error result for tool responses.
 */
export function errorResult(text: string): ToolResult {
    return {
        content: [{ type: 'text', text: `Error: ${text}` }],
        isError: true,
    };
}

/**
 * Wrap a tool's execute function with console logging of tool name and params.
 */
export function withLogging(tool: ToolDescriptor): ToolDescriptor {
    const original = tool.execute;
    return {
        ...tool,
        execute(params: Record<string, unknown>, agent: Agent) {
            const paramStr = Object.keys(params).length > 0 ? ' ' + JSON.stringify(params) : '';
            return original(params, agent);
        },
    };
}

/**
 * Check if an element is a checkbox or radio input.
 */
export function isCheckable(element: HTMLElement): boolean {
    return (
        element instanceof HTMLInputElement &&
        (element.type === 'checkbox' || element.type === 'radio')
    );
}

/**
 * Set the value on an element, handling checkbox/radio (.checked) vs others (.value).
 * Triggers the appropriate event via the automation API.
 */
export function setElementValue(element: HTMLElement, value: string): void {
    if (isCheckable(element)) {
        (element as HTMLInputElement).checked = value === 'true';
    } else {
        (element as HTMLInputElement).value = value;
    }
}

/**
 * Return value-related events to trigger after setting a value,
 * based on the events actually registered on the interaction.
 * Returns all matching value events (input, change) in browser order:
 * 'input' fires first (on each keystroke), 'change' fires second (on commit).
 * Falls back to ['input'] if no value events are registered.
 */
export function getValueEventTypes(registeredEvents: string[]): string[] {
    const result: string[] = [];
    if (registeredEvents.includes('input')) result.push('input');
    if (registeredEvents.includes('change')) result.push('change');
    if (result.length > 0) return result;
    return registeredEvents.length > 0 ? [registeredEvents[0]] : ['input'];
}

/**
 * Extract available option values from a <select> element.
 * Returns undefined for non-select elements.
 */
export function getSelectOptions(element: HTMLElement): string[] | undefined {
    if (!(element instanceof HTMLSelectElement)) return undefined;
    const options: string[] = [];
    for (const opt of Array.from((element as HTMLSelectElement).options)) {
        options.push(opt.value);
    }
    return options;
}
