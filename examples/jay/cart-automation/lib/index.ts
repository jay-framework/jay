import { CartComponent, CartItem } from './cart';
import { wrapWithAutomation, AutomationAPI, PageState } from '@jay-framework/runtime-automation';
import './index.css';

// Initial cart items
const initialItems: CartItem[] = [
    { id: 'item-1', name: 'Wireless Mouse', price: 29.99, quantity: 1 },
    { id: 'item-2', name: 'USB-C Hub', price: 49.99, quantity: 2 },
    { id: 'item-3', name: 'Mechanical Keyboard', price: 89.99, quantity: 1 },
];

// Declare global window extensions for console access
declare global {
    interface Window {
        cart: {
            automation: AutomationAPI;
            // Helper methods for console
            state: () => PageState;
            items: () => CartItem[];
            interactions: () => void;
            remove: (itemId: string) => void;
            increase: (itemId: string) => void;
            decrease: (itemId: string) => void;
            help: () => void;
        };
    }
}

window.onload = function () {
    const target = document.getElementById('target');

    // Create and wrap component with automation
    const instance = CartComponent({ initialItems });
    const wrapped = wrapWithAutomation(instance);

    // Mount the component
    target!.innerHTML = '';
    target!.appendChild(wrapped.element.dom);

    // Subscribe to state changes and log to console
    wrapped.automation.onStateChange((state) => {
        console.log('%c[State Changed]', 'color: #4CAF50; font-weight: bold');
        console.log('ViewState:', state.viewState);
        console.log('Interactions:', state.interactions.length, 'groups available');
    });

    // Create console API
    const consoleAPI = {
        automation: wrapped.automation,

        // Get current state
        state: () => {
            const state = wrapped.automation.getPageState();
            console.table(state.viewState);
            return state;
        },

        // Get items
        items: () => {
            const state = wrapped.automation.getPageState();
            console.table((state.viewState as any).items);
            return (state.viewState as any).items;
        },

        // List all interactions (grouped)
        interactions: () => {
            const state = wrapped.automation.getPageState();
            console.log('%cAvailable Interactions:', 'color: #2196F3; font-weight: bold');
            state.interactions.forEach((group) => {
                if (group.inForEach && group.items) {
                    const itemList = group.items.map((i) => `${i.id} (${i.label})`).join(', ');
                    console.log(`  ${group.ref} [${group.type}] forEach: ${itemList}`);
                } else {
                    console.log(`  ${group.ref} [${group.type}] events: ${group.events.join(', ')}`);
                }
            });
        },

        // Remove item by ID
        remove: (itemId: string) => {
            console.log(`Removing item: ${itemId}`);
            wrapped.automation.triggerEvent('click', [itemId, 'removeBtn']);
        },

        // Increase quantity
        increase: (itemId: string) => {
            console.log(`Increasing quantity: ${itemId}`);
            wrapped.automation.triggerEvent('click', [itemId, 'increaseBtn']);
        },

        // Decrease quantity
        decrease: (itemId: string) => {
            console.log(`Decreasing quantity: ${itemId}`);
            wrapped.automation.triggerEvent('click', [itemId, 'decreaseBtn']);
        },

        // Help
        help: () => {
            console.log(
                '%c=== Cart Automation API ===',
                'color: #FF9800; font-weight: bold; font-size: 14px',
            );
            console.log('');
            console.log('%cCommands:', 'color: #2196F3; font-weight: bold');
            console.log('  cart.state()           - Show current ViewState');
            console.log('  cart.items()           - Show cart items as table');
            console.log('  cart.interactions()    - List all available interactions');
            console.log('  cart.remove("item-1")  - Remove item by ID');
            console.log('  cart.increase("item-1") - Increase item quantity');
            console.log('  cart.decrease("item-1") - Decrease item quantity');
            console.log('');
            console.log('%cAdvanced (raw API):', 'color: #9C27B0; font-weight: bold');
            console.log('  cart.automation.getPageState()');
            console.log('  cart.automation.triggerEvent("click", ["item-1", "removeBtn"])');
            console.log('  cart.automation.getInteraction(["item-1", "removeBtn"])');
            console.log('  cart.automation.onStateChange(callback)');
            console.log('');
        },
    };

    // Expose to window
    window.cart = consoleAPI;

    // Initial help message
    console.log(
        '%c🛒 Cart Automation Ready!',
        'color: #4CAF50; font-weight: bold; font-size: 16px',
    );
    console.log(
        'Type %ccart.help()%c for available commands',
        'color: #2196F3; font-weight: bold',
        'color: inherit',
    );
    console.log('');

    // Show initial state
    console.log('%c[Initial State]', 'color: #FF9800; font-weight: bold');
    consoleAPI.items();
};
