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

            const interactionSummary = interactions
                .map((g) => {
                    const desc = g.description || g.ref;
                    if (g.inForEach && g.items) {
                        const itemList = g.items.map((i) => `${i.id} (${i.label})`).join(', ');
                        return `- ${desc} [${g.type}] — forEach with items: ${itemList}`;
                    }
                    return `- ${desc} [${g.type}] — events: ${g.events.join(', ')}`;
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
                                interactionSummary,
                                '',
                                'Use the provided tools to read state and interact with the page.',
                                'For forEach interactions, provide the itemId parameter.',
                                'Use get-page-state to refresh the current state after making changes.',
                            ].join('\n'),
                        },
                    },
                ],
            };
        },
    };
}
