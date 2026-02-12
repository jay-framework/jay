import { vi } from 'vitest';
import type { AutomationAPI, PageState, Interaction, GroupedInteraction } from '@jay-framework/runtime-automation';
import type { ModelContextContainer, Registration, ToolDescriptor, ResourceDescriptor, PromptDescriptor } from '../lib/webmcp-types';

/**
 * Create a mock AutomationAPI for testing.
 */
export function createMockAutomation(overrides: Partial<{
    viewState: object;
    interactions: GroupedInteraction[];
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
        getInteraction: vi.fn((coordinate: string[]) => {
            // Return a mock Interaction with a mock element
            return {
                refName: coordinate[coordinate.length - 1],
                coordinate,
                element: document.createElement('input'),
                elementType: 'HTMLInputElement',
                supportedEvents: ['click', 'input', 'change'],
            } satisfies Interaction;
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

/**
 * Sample grouped interactions for the cart example.
 */
export function cartInteractions(): GroupedInteraction[] {
    return [
        {
            ref: 'decreaseBtn',
            type: 'Button',
            events: ['click'],
            inForEach: true,
            items: [
                { id: 'item-1', label: 'Wireless Mouse' },
                { id: 'item-2', label: 'USB-C Hub' },
            ],
        },
        {
            ref: 'increaseBtn',
            type: 'Button',
            events: ['click'],
            inForEach: true,
            items: [
                { id: 'item-1', label: 'Wireless Mouse' },
                { id: 'item-2', label: 'USB-C Hub' },
            ],
        },
        {
            ref: 'removeBtn',
            type: 'Button',
            events: ['click'],
            inForEach: true,
            items: [
                { id: 'item-1', label: 'Wireless Mouse' },
                { id: 'item-2', label: 'USB-C Hub' },
            ],
        },
        {
            ref: 'nameInput',
            type: 'TextInput',
            events: ['input', 'change'],
        },
        {
            ref: 'priceInput',
            type: 'TextInput',
            events: ['input', 'change'],
        },
        {
            ref: 'addBtn',
            type: 'Button',
            events: ['click'],
        },
    ];
}
