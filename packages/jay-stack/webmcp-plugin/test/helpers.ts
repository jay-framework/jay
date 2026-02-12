import { vi } from 'vitest';
import type { AutomationAPI, PageState, Interaction, InteractionInstance } from '@jay-framework/runtime-automation';
import type { ModelContextContainer, Registration, ToolDescriptor, ResourceDescriptor, PromptDescriptor } from '../lib/webmcp-types';

/**
 * Create a mock AutomationAPI for testing.
 */
export function createMockAutomation(overrides: Partial<{
    viewState: object;
    interactions: Interaction[];
    customEvents: Array<{ name: string }>;
}>= {}): AutomationAPI {
    const {
        viewState = {},
        interactions = [],
        customEvents = [],
    } = overrides;

    const stateListeners = new Set<(state: PageState) => void>();

    const automation: AutomationAPI = {
        getPageState: vi.fn(() => ({
            viewState,
            interactions,
            customEvents,
        })),
        triggerEvent: vi.fn(),
        onStateChange: vi.fn((cb: (state: PageState) => void) => {
            stateListeners.add(cb);
            return () => stateListeners.delete(cb);
        }),
        getInteraction: vi.fn((coordinate: string[]): InteractionInstance | undefined => {
            // Search through groups to find matching instance
            for (const group of interactions) {
                for (const item of group.items) {
                    if (
                        item.coordinate.length === coordinate.length &&
                        item.coordinate.every((c, i) => c === coordinate[i])
                    ) {
                        return item;
                    }
                }
            }
            return undefined;
        }),
        getCustomEvents: vi.fn(() => customEvents),
        onComponentEvent: vi.fn(() => () => {}),
        dispose: vi.fn(),
    };

    // Helper to trigger state change listeners
    (automation as any)._notifyStateChange = () => {
        const state = automation.getPageState();
        stateListeners.forEach((cb) => cb(state));
    };

    return automation;
}

/**
 * Create a mock ModelContextContainer for testing.
 */
export function createMockModelContext(): ModelContextContainer & {
    _tools: Map<string, ToolDescriptor>;
    _resources: Map<string, ResourceDescriptor>;
    _prompts: Map<string, PromptDescriptor>;
} {
    const tools = new Map<string, ToolDescriptor>();
    const resources = new Map<string, ResourceDescriptor>();
    const prompts = new Map<string, PromptDescriptor>();

    function makeRegistration(map: Map<string, any>, key: string): Registration {
        return {
            unregister: vi.fn(() => map.delete(key)),
        };
    }

    return {
        _tools: tools,
        _resources: resources,
        _prompts: prompts,
        provideContext: vi.fn(),
        registerTool: vi.fn((tool: ToolDescriptor) => {
            tools.set(tool.name, tool);
            return makeRegistration(tools, tool.name);
        }),
        unregisterTool: vi.fn((name: string) => tools.delete(name)),
        registerResource: vi.fn((resource: ResourceDescriptor) => {
            resources.set(resource.uri, resource);
            return makeRegistration(resources, resource.uri);
        }),
        registerPrompt: vi.fn((prompt: PromptDescriptor) => {
            prompts.set(prompt.name, prompt);
            return makeRegistration(prompts, prompt.name);
        }),
    };
}

/** Helper: create an InteractionInstance with a real DOM element */
function instance(coordinate: string[], tag: string = 'button'): InteractionInstance {
    const el = document.createElement(tag);
    const events = tag === 'button' || tag === 'a' ? ['click']
        : tag === 'select' ? ['change']
        : tag === 'input' || tag === 'textarea' ? ['input', 'change']
        : ['click'];
    return { coordinate, element: el, events };
}

/**
 * Sample grouped interactions for the cart example.
 * Each Interaction group has real DOM elements.
 */
export function cartInteractions(): Interaction[] {
    return [
        {
            refName: 'decreaseBtn',
            items: [
                instance(['item-1', 'decreaseBtn']),
                instance(['item-2', 'decreaseBtn']),
            ],
        },
        {
            refName: 'increaseBtn',
            items: [
                instance(['item-1', 'increaseBtn']),
                instance(['item-2', 'increaseBtn']),
            ],
        },
        {
            refName: 'removeBtn',
            items: [
                instance(['item-1', 'removeBtn']),
                instance(['item-2', 'removeBtn']),
            ],
        },
        {
            refName: 'nameInput',
            items: [instance(['nameInput'], 'input')],
        },
        {
            refName: 'priceInput',
            items: [instance(['priceInput'], 'input')],
        },
        {
            refName: 'addBtn',
            items: [instance(['addBtn'])],
        },
    ];
}
