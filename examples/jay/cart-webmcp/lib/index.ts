import { CartComponent, CartItem } from './cart';
import { wrapWithAutomation, AutomationAPI } from '@jay-framework/runtime-automation';
import type { ToolResult } from './webmcp-types';
import './webmcp-types'; // side-effect: augments Navigator with modelContext
import './index.css';

// ── Initial Data ────────────────────────────────────────────────────────────

const initialItems: CartItem[] = [
    { id: 'item-1', name: 'Wireless Mouse', price: 29.99, quantity: 1 },
    { id: 'item-2', name: 'USB-C Hub', price: 49.99, quantity: 2 },
    { id: 'item-3', name: 'Mechanical Keyboard', price: 89.99, quantity: 1 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCartItems(automation: AutomationAPI): CartItem[] {
    const state = automation.getPageState();
    return (state.viewState as { items: CartItem[] }).items || [];
}

function getCartState(automation: AutomationAPI) {
    const state = automation.getPageState();
    const vs = state.viewState as { items: CartItem[]; total: number; itemCount: number };
    return { items: vs.items, total: vs.total, itemCount: vs.itemCount };
}

function textResult(text: string): ToolResult {
    return { content: [{ type: 'text', text }] };
}

function jsonResult(label: string, data: unknown): ToolResult {
    return {
        content: [{ type: 'text', text: `${label}\n${JSON.stringify(data, null, 2)}` }],
    };
}

// ── Boot ────────────────────────────────────────────────────────────────────

window.onload = function () {
    const target = document.getElementById('target');
    const statusEl = document.getElementById('webmcp-status');

    // Check for native WebMCP support
    if (!navigator.modelContext) {
        if (statusEl) {
            statusEl.className = 'status-unsupported';
            statusEl.innerHTML =
                '<p><strong>WebMCP not available</strong></p>' +
                '<p>This example requires a browser with WebMCP support ' +
                '(e.g. Chrome Canary with the WebMCP flag enabled).</p>' +
                '<p>See <a href="https://github.com/webmachinelearning/webmcp" target="_blank">github.com/webmachinelearning/webmcp</a></p>';
        }
        return;
    }

    // WebMCP is available
    if (statusEl) {
        statusEl.className = 'status-supported';
        statusEl.innerHTML =
            '<p><strong>WebMCP active</strong> &mdash; navigator.modelContext detected.</p>' +
            '<p>Cart context and tools are registered and available to connected agents.</p>';
    }

    // Create and wrap the cart component with automation
    const instance = CartComponent({ initialItems });
    const wrapped = wrapWithAutomation(instance);

    // Mount
    target!.innerHTML = '';
    target!.appendChild(wrapped.element.dom);

    const automation = wrapped.automation;

    // ── Register tools ──────────────────────────────────────────────────
    // Each tool is registered individually via registerTool().
    // (provideContext is the batch "set all at once" alternative that
    // clears previous tools — we use registerTool for incremental registration.)

    navigator.modelContext.registerTool({
        name: 'get-cart-state',
        description:
            'Get the current shopping cart state including all items, total price, and item count.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            return jsonResult('Current cart state:', getCartState(automation));
        },
    });

    navigator.modelContext.registerTool({
        name: 'get-interactions',
        description:
            'List all available UI interactions (buttons, controls) that can be triggered on the cart.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            const state = automation.getPageState();
            const interactions = state.interactions.map((i) => ({
                refName: i.refName,
                coordinate: i.coordinate,
                itemContext: i.itemContext
                    ? { name: (i.itemContext as CartItem).name, id: (i.itemContext as CartItem).id }
                    : null,
            }));
            return jsonResult('Available interactions:', interactions);
        },
    });

    navigator.modelContext.registerTool({
        name: 'add-item',
        description: 'Add a new item to the shopping cart. Returns the updated cart state.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the item to add' },
                price: { type: 'number', description: 'The price of the item in dollars' },
                quantity: { type: 'number', description: 'Initial quantity (defaults to 1)' },
            },
            required: ['name', 'price'],
        },
        execute: ({ name, price, quantity }) => {
            const itemName = name as string;
            const itemPrice = price as number;
            const itemQuantity = (quantity as number) || 1;

            if (!itemName || itemName.trim() === '') {
                return textResult('Error: Item name is required.');
            }
            if (!itemPrice || itemPrice <= 0) {
                return textResult('Error: Price must be greater than 0.');
            }

            const currentItems = getCartItems(automation);
            const newItem: CartItem = {
                id: `item-${Date.now()}`,
                name: itemName.trim(),
                price: itemPrice,
                quantity: itemQuantity,
            };
            const componentInstance = (wrapped as any).component || wrapped;
            if (componentInstance.setItems) {
                componentInstance.setItems([...currentItems, newItem]);
            }

            return jsonResult(`Added "${itemName}" ($${itemPrice}) x${itemQuantity} to cart.`, getCartState(automation));
        },
    });

    navigator.modelContext.registerTool({
        name: 'remove-item',
        description: 'Remove an item from the cart by its ID. Use get-cart-state to find item IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: { type: 'string', description: 'The unique ID of the item to remove (e.g. "item-1")' },
            },
            required: ['itemId'],
        },
        execute: ({ itemId }) => {
            const id = itemId as string;
            const items = getCartItems(automation);
            const item = items.find((i) => i.id === id);

            if (!item) {
                return textResult(`Error: Item "${id}" not found. Available IDs: ${items.map((i) => i.id).join(', ')}`);
            }

            automation.triggerEvent('click', [id, 'removeBtn']);
            return jsonResult(`Removed "${item.name}" from cart.`, getCartState(automation));
        },
    });

    navigator.modelContext.registerTool({
        name: 'update-quantity',
        description: 'Increase or decrease the quantity of an item in the cart.',
        inputSchema: {
            type: 'object',
            properties: {
                itemId: { type: 'string', description: 'The unique ID of the item (e.g. "item-1")' },
                action: { type: 'string', description: 'Whether to increase or decrease the quantity', enum: ['increase', 'decrease'] },
            },
            required: ['itemId', 'action'],
        },
        execute: ({ itemId, action }) => {
            const id = itemId as string;
            const act = action as string;
            const items = getCartItems(automation);
            const item = items.find((i) => i.id === id);

            if (!item) {
                return textResult(`Error: Item "${id}" not found. Available IDs: ${items.map((i) => i.id).join(', ')}`);
            }

            if (act === 'increase') {
                automation.triggerEvent('click', [id, 'increaseBtn']);
            } else if (act === 'decrease') {
                if (item.quantity <= 1) {
                    return textResult(`Cannot decrease: "${item.name}" already has quantity 1. Use remove-item to remove it.`);
                }
                automation.triggerEvent('click', [id, 'decreaseBtn']);
            } else {
                return textResult(`Error: Invalid action "${act}". Use "increase" or "decrease".`);
            }

            return jsonResult(`${act === 'increase' ? 'Increased' : 'Decreased'} quantity of "${item.name}".`, getCartState(automation));
        },
    });

    navigator.modelContext.registerTool({
        name: 'clear-cart',
        description: 'Remove all items from the shopping cart.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            const items = getCartItems(automation);
            if (items.length === 0) {
                return textResult('Cart is already empty.');
            }

            for (const item of items) {
                automation.triggerEvent('click', [item.id, 'removeBtn']);
            }

            return textResult(`Cleared cart. Removed ${items.length} item(s).`);
        },
    });

    console.log(
        '%c[WebMCP] Page context provided + 6 tools registered',
        'color: #7c4dff; font-weight: bold',
    );
};
