/**
 * Gemini Chat headless component.
 *
 * Manages conversation state client-side. The server is stateless —
 * full history is sent with each request.
 */

import { makeJayStackComponent, RenderPipeline, Signals } from '@jay-framework/fullstack-component';
import { createSignal, createMemo, createEffect } from '@jay-framework/component';
import { createActionCaller } from '@jay-framework/stack-client-runtime';
import type { AutomationAPI } from '@jay-framework/runtime-automation';
import type { JayEvent } from '@jay-framework/runtime';
import type {
    GeminiChatContract,
    GeminiChatRefs,
    GeminiChatFastViewState,
    GeminiChatViewState,
} from './gemini-chat.jay-contract';
import type {
    GeminiMessage,
    SendMessageInput,
    SendMessageOutput,
    SubmitToolResultsInput,
    SubmitToolResultsOutput,
    SerializedToolDef,
    PendingToolCall,
    ToolCallResult,
} from './gemini-types';

// ============================================================================
// Types
// ============================================================================

export interface GeminiChatProps {}

interface ChatCarryForward {}

interface DisplayMessage {
    index: number;
    role: 'user' | 'assistant';
    content: string;
}

// ============================================================================
// Action Callers (created once, used from interactive phase)
// ============================================================================

const callSendMessage = createActionCaller<SendMessageInput, SendMessageOutput>(
    'geminiAgent.sendMessage',
    'POST',
);

const callSubmitToolResults = createActionCaller<SubmitToolResultsInput, SubmitToolResultsOutput>(
    'geminiAgent.submitToolResults',
    'POST',
);

// ============================================================================
// Tool Building (from AutomationAPI, similar to webmcp)
// ============================================================================

function buildSerializedTools(automation: AutomationAPI): SerializedToolDef[] {
    const { interactions } = automation.getPageState();
    const tools: SerializedToolDef[] = [];

    for (const group of interactions) {
        const sample = group.items[0];
        if (!sample) continue;

        const elementType = sample.element.constructor.name;
        const isFillable = [
            'HTMLInputElement',
            'HTMLTextAreaElement',
            'HTMLSelectElement',
        ].includes(elementType);
        const isCheckbox =
            elementType === 'HTMLInputElement' &&
            ['checkbox', 'radio'].includes((sample.element as HTMLInputElement).type);
        const isForEach = group.items.length > 1 || sample.coordinate.length > 1;

        const prefix = isCheckbox ? 'toggle' : isFillable ? 'fill' : 'click';
        const toolName = `${prefix}-${toKebab(group.refName)}`;
        const humanName = toHumanReadable(group.refName);

        const description =
            group.description ||
            `${isCheckbox ? 'Toggle' : isFillable ? 'Fill' : 'Click'} ${humanName}${isForEach ? ' for a specific item' : ''}`;

        const properties: Record<string, any> = {};
        const required: string[] = [];

        if (isForEach) {
            properties.coordinate = {
                type: 'string',
                description: `Item coordinate (e.g. "${sample.coordinate.join('/')}")`,
            };
            required.push('coordinate');
        }

        if (isFillable && !isCheckbox) {
            properties.value = {
                type: 'string',
                description: `Value to set in ${humanName}`,
            };
            required.push('value');
        }

        tools.push({
            name: toolName,
            description,
            inputSchema: {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined,
            },
            category: 'page-automation',
        });
    }

    return tools;
}

function toKebab(s: string): string {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function toHumanReadable(s: string): string {
    return s
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .toLowerCase();
}

// ============================================================================
// Client-Side Tool Execution
// ============================================================================

function executePageAutomationTool(
    automation: AutomationAPI,
    call: PendingToolCall,
): ToolCallResult {
    try {
        const { interactions } = automation.getPageState();
        const toolName = call.name;
        const args = call.args;

        // Parse tool name to find the interaction
        const parts = toolName.split('-');
        const prefix = parts[0]; // click, fill, toggle
        const refName = parts.slice(1).join('-');

        // Find matching interaction group by converting back from kebab to camelCase
        const group = interactions.find((g) => toKebab(g.refName) === refName);

        if (!group) {
            return {
                callId: call.id,
                result: JSON.stringify({ error: `Interaction '${refName}' not found` }),
                isError: true,
            };
        }

        // Find the specific item
        let item = group.items[0];
        if (args.coordinate && typeof args.coordinate === 'string') {
            const coord = args.coordinate.split('/');
            item =
                group.items.find((i) => i.coordinate.join('/') === args.coordinate) ||
                group.items[0];
        }

        if (!item) {
            return {
                callId: call.id,
                result: JSON.stringify({ error: 'Item not found' }),
                isError: true,
            };
        }

        // Execute based on prefix
        if (prefix === 'fill' && args.value != null) {
            const el = item.element as HTMLInputElement;
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, String(args.value));
            } else {
                el.value = String(args.value);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // click or toggle
            item.element.click();
        }

        // Get updated page state
        const newState = automation.getPageState();
        return {
            callId: call.id,
            result: JSON.stringify({ success: true, pageState: newState.viewState }),
        };
    } catch (error: any) {
        return {
            callId: call.id,
            result: JSON.stringify({ error: error.message }),
            isError: true,
        };
    }
}

// ============================================================================
// Component Definition
// ============================================================================

async function fastRender() {
    const Pipeline = RenderPipeline.for<GeminiChatFastViewState, ChatCarryForward>();

    return Pipeline.ok({}).toPhaseOutput(() => ({
        viewState: {
            messages: [],
            lastUserMessage: '',
            lastAssistantMessage: '',
            messageInput: '',
            isLoading: false,
            isExpanded: false,
            hasError: false,
            hasMessages: false,
            errorMessage: '',
        },
        carryForward: {},
    }));
}

function GeminiChatInteractive(
    _props: GeminiChatProps,
    refs: GeminiChatRefs,
    fastViewState: Signals<GeminiChatFastViewState>,
    _carryForward: ChatCarryForward,
) {
    // ── State ────────────────────────────────────────────────────────────
    const [getMessages, setMessages] = createSignal<DisplayMessage[]>([]);
    const [getHistory, setHistory] = createSignal<GeminiMessage[]>([]);
    const [getInputValue, setInputValue] = createSignal('');
    const [getIsLoading, setIsLoading] = createSignal(false);
    const [getIsExpanded, setIsExpanded] = createSignal(false);
    const [getError, setError] = createSignal<string | null>(null);

    // ── Derived state ────────────────────────────────────────────────────
    const hasMessages = createMemo(() => getMessages().length > 0);
    const hasError = createMemo(() => getError() !== null);
    const lastUserMessage = createMemo(() => {
        const msgs = getMessages();
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') return msgs[i].content;
        }
        return '';
    });
    const lastAssistantMessage = createMemo(() => {
        const msgs = getMessages();
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant') return msgs[i].content;
        }
        return '';
    });

    // ── AutomationAPI access ─────────────────────────────────────────────
    const getAutomation = (): AutomationAPI | null => (window as any).__jay?.automation || null;

    function getToolsAndState(): {
        toolDefinitions: SerializedToolDef[];
        pageState: object;
    } {
        const automation = getAutomation();
        if (!automation) {
            return { toolDefinitions: [], pageState: {} };
        }
        return {
            toolDefinitions: buildSerializedTools(automation),
            pageState: automation.getPageState().viewState,
        };
    }

    // ── Tool execution loop ──────────────────────────────────────────────
    async function handleToolCalls(output: SendMessageOutput): Promise<void> {
        while (output.type === 'tool-calls') {
            setHistory(output.history);

            const automation = getAutomation();
            if (!automation) {
                setError('AutomationAPI not available');
                return;
            }

            // Execute page automation tools
            const results: ToolCallResult[] = output.calls
                .filter((c) => c.category === 'page-automation')
                .map((call) => executePageAutomationTool(automation, call));

            // Get fresh tools and state after execution
            const { toolDefinitions, pageState } = getToolsAndState();

            // Submit results back to server
            const nextOutput: SubmitToolResultsOutput = await callSubmitToolResults({
                results,
                history: output.history,
                toolDefinitions,
                pageState,
            });

            output = nextOutput;
        }

        // Final text response
        const finalOutput = output;
        if (finalOutput.type === 'response') {
            setHistory(finalOutput.history);
            setMessages((msgs) => [
                ...msgs,
                {
                    index: msgs.length,
                    role: 'assistant',
                    content: finalOutput.message,
                },
            ]);
        }
    }

    // ── Send message handler ─────────────────────────────────────────────
    async function sendMessage() {
        const message = getInputValue().trim();
        if (!message || getIsLoading()) return;

        setError(null);
        setIsLoading(true);
        setInputValue('');

        // Add user message to display
        setMessages((msgs) => [...msgs, { index: msgs.length, role: 'user', content: message }]);

        try {
            const { toolDefinitions, pageState } = getToolsAndState();

            const output = await callSendMessage({
                message,
                history: getHistory(),
                toolDefinitions,
                pageState,
            });

            await handleToolCalls(output);
        } catch (error: any) {
            setError(error.message || 'Failed to send message');
        } finally {
            setIsLoading(false);
        }
    }

    // ── Wire refs ────────────────────────────────────────────────────────
    refs.sendMessage.onclick(sendMessage);

    refs.toggleExpand.onclick(() => {
        setIsExpanded((v) => !v);
    });

    refs.messageInput.oninput((jayEvent: JayEvent<Event, GeminiChatViewState>) => {
        setInputValue((jayEvent.event.target as HTMLInputElement).value);
    });

    refs.messageInput.onkeydown((jayEvent: JayEvent<KeyboardEvent, GeminiChatViewState>) => {
        if (jayEvent.event.key === 'Enter' && !jayEvent.event.shiftKey) {
            jayEvent.event.preventDefault();
            sendMessage();
        }
    });

    // ── Render ───────────────────────────────────────────────────────────
    return {
        render: () => ({
            messages: () =>
                getMessages().map((m) => ({
                    index: m.index,
                    role: m.role as any,
                    content: m.content,
                })),
            lastUserMessage,
            lastAssistantMessage,
            messageInput: getInputValue,
            isLoading: getIsLoading,
            isExpanded: getIsExpanded,
            hasError,
            hasMessages,
            errorMessage: () => getError() || '',
        }),
    };
}

export const geminiChat = makeJayStackComponent<GeminiChatContract>()
    .withProps<GeminiChatProps>()
    .withFastRender(fastRender)
    .withInteractive(GeminiChatInteractive);
