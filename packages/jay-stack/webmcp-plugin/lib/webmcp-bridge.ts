import type { AutomationAPI } from '@jay-framework/runtime-automation';
import type { ToolDescriptor } from './webmcp-types';
import './webmcp-types'; // side-effect: augments Navigator

import { makeGetPageStateTool, makeListInteractionsTool, makeTriggerInteractionTool, makeFillInputTool } from './generic-tools';
import { buildSemanticTools } from './semantic-tools';

/**
 * Main entry point. Registers all WebMCP tools derived from the given
 * AutomationAPI instance.
 *
 * @returns Cleanup function that unregisters everything.
 */
export function setupWebMCP(automation: AutomationAPI): () => void {
    if (!navigator.modelContext) {
        console.warn('[WebMCP] navigator.modelContext not available — skipping registration');
        return () => {};
    }

    const mc = navigator.modelContext;

    // ── Generic tools (stable set, always registered) ───────────────────
    const genericTools = [
        makeGetPageStateTool(automation),
        makeListInteractionsTool(automation),
        makeTriggerInteractionTool(automation),
        makeFillInputTool(automation),
    ];
    for (const tool of genericTools) {
        mc.registerTool(tool);
    }

    // ── Semantic tools (regenerated when interactions change) ────────────
    let semanticTools = buildAndRegisterSemanticTools(mc, automation);
    let lastKey = interactionKey(automation);

    const unsubscribe = automation.onStateChange(() => {
        const newKey = interactionKey(automation);
        if (newKey !== lastKey) {
            // Interactions structure changed — regenerate semantic tools
            semanticTools.forEach((t) => mc.unregisterTool(t.name));
            semanticTools = buildAndRegisterSemanticTools(mc, automation);
            lastKey = newKey;
        }
    });

    // ── Console API ─────────────────────────────────────────────────────
    const allTools = () => [...genericTools, ...semanticTools];
    (window as any).webmcp = {
        tools() {
            const tools = allTools();
            console.table(tools.map((t) => ({ name: t.name, description: t.description })));
            return tools;
        },
    };

    console.log(
        `[WebMCP] Registered ${genericTools.length + semanticTools.length} tools — type webmcp.tools() to list`,
    );

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
        unsubscribe();
        genericTools.forEach((t) => mc.unregisterTool(t.name));
        semanticTools.forEach((t) => mc.unregisterTool(t.name));
        delete (window as any).webmcp;
    };
}

/**
 * Build semantic tools, register them, and return the tool descriptors.
 */
function buildAndRegisterSemanticTools(
    mc: Pick<Navigator['modelContext'] & object, 'registerTool'>,
    automation: AutomationAPI,
): ToolDescriptor[] {
    const tools = buildSemanticTools(automation);
    for (const tool of tools) {
        mc.registerTool(tool);
    }
    return tools;
}

/**
 * Quick fingerprint of interaction structure to detect when
 * semantic tools need regeneration (e.g., forEach items added/removed).
 */
function interactionKey(automation: AutomationAPI): string {
    return automation
        .getPageState()
        .interactions.map((g) =>
            `${g.refName}:${g.items.map((i) => i.coordinate.join('/')).join(',')}`,
        )
        .join('|');
}
