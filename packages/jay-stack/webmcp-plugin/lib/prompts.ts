import type { AutomationAPI } from '@jay-framework/runtime-automation';
import type { PromptDescriptor } from './webmcp-types';

/**
 * page-guide — Contextual guide for interacting with the current page.
 * Returns a message describing the page's state and available interactions.
 */
export function makePageGuidePrompt(automation: AutomationAPI): PromptDescriptor {
    return {
        name: 'page-guide',
        description: 'Guide for interacting with the current page — describes state and available actions',
        get() {
            const { viewState, interactions } = automation.getPageState();

            const interactionLines = interactions
                .map((group) => {
                    const elementType = group.items[0]?.element.constructor.name ?? 'unknown';
                    const events = group.items[0]?.events.join(', ') ?? '';
                    const coords = group.items.map((i) => `"${i.coordinate.join('/')}"`).join(', ');
                    const desc = group.description || group.refName;
                    return `- ${desc} [${elementType}] coordinates: ${coords} events: ${events}`;
                })
                .join('\n');

            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: [
                                'This page has the following state:',
                                JSON.stringify(viewState, null, 2),
                                '',
                                'Available interactions:',
                                interactionLines,
                                '',
                                'Coordinates identify interactive elements. Multi-segment coordinates (e.g. "item-1/removeBtn") target elements inside lists.',
                                'The first segments match item IDs in the ViewState arrays above.',
                                'Use the provided tools to read state and trigger interactions.',
                            ].join('\n'),
                        },
                    },
                ],
            };
        },
    };
}
