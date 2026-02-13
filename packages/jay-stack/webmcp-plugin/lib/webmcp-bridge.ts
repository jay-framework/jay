import type { AutomationAPI } from '@jay-framework/runtime-automation';
import './webmcp-types'; // side-effect: augments Navigator

import { makeGetPageStateTool, makeListInteractionsTool, makeTriggerInteractionTool, makeFillInputTool } from './generic-tools';
import { buildSemanticTools } from './semantic-tools';

/** Names of the generic tools (stable set) */
const GENERIC_TOOL_NAMES = ['get-page-state', 'list-interactions', 'trigger-interaction', 'fill-input'];

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
    mc.registerTool(makeGetPageStateTool(automation));
    mc.registerTool(makeListInteractionsTool(automation));
    mc.registerTool(makeTriggerInteractionTool(automation));
    mc.registerTool(makeFillInputTool(automation));

    // ── Semantic tools (regenerated when interactions change) ────────────
    let semanticToolNames = registerSemanticTools(mc, automation);
    let lastKey = interactionKey(automation);

    const unsubscribe = automation.onStateChange(() => {
        const newKey = interactionKey(automation);
        if (newKey !== lastKey) {
            // Interactions structure changed — regenerate semantic tools
            semanticToolNames.forEach((name) => mc.unregisterTool(name));
            semanticToolNames = registerSemanticTools(mc, automation);
            lastKey = newKey;
        }
    });

    console.log(
        `[WebMCP] Registered ${GENERIC_TOOL_NAMES.length + semanticToolNames.length} tools (${GENERIC_TOOL_NAMES.length} generic + ${semanticToolNames.length} semantic)`,
    );

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
        unsubscribe();
        GENERIC_TOOL_NAMES.forEach((name) => mc.unregisterTool(name));
        semanticToolNames.forEach((name) => mc.unregisterTool(name));
    };
}

/**
 * Register semantic tools and return their names (for later unregistration).
 */
function registerSemanticTools(
    mc: Pick<Navigator['modelContext'] & object, 'registerTool'>,
    automation: AutomationAPI,
): string[] {
    const tools = buildSemanticTools(automation);
    for (const tool of tools) {
        mc.registerTool(tool);
    }
    return tools.map((t) => t.name);
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
