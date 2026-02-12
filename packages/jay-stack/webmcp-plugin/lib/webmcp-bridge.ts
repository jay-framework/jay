import type { AutomationAPI } from '@jay-framework/runtime-automation';
import type { Registration } from './webmcp-types';
import './webmcp-types'; // side-effect: augments Navigator

import { makeGetPageStateTool, makeListInteractionsTool, makeTriggerInteractionTool, makeFillInputTool } from './generic-tools';
import { makeViewStateResource, makeInteractionsResource } from './resources';
import { makePageGuidePrompt } from './prompts';
import { registerSemanticTools } from './semantic-tools';

/**
 * Main entry point. Registers all WebMCP tools, resources, and prompts
 * derived from the given AutomationAPI instance.
 *
 * @returns Cleanup function that unregisters everything.
 */
export function setupWebMCP(automation: AutomationAPI): () => void {
    if (!navigator.modelContext) {
        console.warn('[WebMCP] navigator.modelContext not available — skipping registration');
        return () => {};
    }

    const mc = navigator.modelContext;
    const registrations: Registration[] = [];

    // ── Generic tools (stable set, always registered) ───────────────────
    registrations.push(mc.registerTool(makeGetPageStateTool(automation)));
    registrations.push(mc.registerTool(makeListInteractionsTool(automation)));
    registrations.push(mc.registerTool(makeTriggerInteractionTool(automation)));
    registrations.push(mc.registerTool(makeFillInputTool(automation)));

    // ── Resources ───────────────────────────────────────────────────────
    registrations.push(mc.registerResource(makeViewStateResource(automation)));
    registrations.push(mc.registerResource(makeInteractionsResource(automation)));

    // ── Prompt ──────────────────────────────────────────────────────────
    registrations.push(mc.registerPrompt(makePageGuidePrompt(automation)));

    // ── Semantic tools (regenerated when interactions change) ────────────
    let semanticRegs = registerSemanticTools(mc, automation);
    let lastKey = interactionKey(automation);

    const unsubscribe = automation.onStateChange(() => {
        const newKey = interactionKey(automation);
        if (newKey !== lastKey) {
            // Interactions structure changed — regenerate semantic tools
            semanticRegs.forEach((r) => r.unregister());
            semanticRegs = registerSemanticTools(mc, automation);
            lastKey = newKey;
        }
    });

    const genericCount = 4;
    const semanticCount = semanticRegs.length;
    console.log(
        `[WebMCP] Registered ${genericCount + semanticCount} tools (${genericCount} generic + ${semanticCount} semantic), 2 resources, 1 prompt`,
    );

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
        unsubscribe();
        registrations.forEach((r) => r.unregister());
        semanticRegs.forEach((r) => r.unregister());
    };
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
