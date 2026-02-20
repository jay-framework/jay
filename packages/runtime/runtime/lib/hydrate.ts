import { ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult } from '@jay-framework/list-compare';
import { RandomAccessLinkedList as List } from '@jay-framework/list-compare';
import { Kindergarten, KindergartenGroup } from './kindergarden';
import {
    CONSTRUCTION_CONTEXT_MARKER,
    ConstructContext,
    currentConstructionContext,
    restoreContext,
    saveContext,
    withContext,
    wrapWithModifiedCheck,
} from './context';
import {
    BaseJayElement,
    MountFunc,
    noopMount,
    noopUpdate,
    updateFunc,
} from './element-types';
import { normalizeMount, normalizeUpdates, type Attributes } from './element';
import type { PrivateRef } from './node-reference';

const STYLE = 'style';

// ============================================================================
// adoptText
// ============================================================================

/**
 * Adopt an existing text node inside the element at the given coordinate.
 *
 * Reads the current ConstructContext from the stack (via currentConstructionContext())
 * to resolve the coordinate to an existing DOM element. Finds the first text child
 * of that element and connects a dynamic text updater to it.
 *
 * This is the hydration counterpart to dynamicText() — instead of creating a new
 * text node, it adopts an existing one from server-rendered HTML.
 */
export function adoptText<ViewState>(
    coordinate: string,
    accessor: (vs: ViewState) => string | number | boolean,
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState> {
    const context = currentConstructionContext();
    const element = context.resolveCoordinate(coordinate);

    if (!element) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
            console.warn(`[jay hydration] coordinate "${coordinate}" not found in DOM`);
        }
        return { dom: undefined as any, update: noopUpdate, mount: noopMount, unmount: noopMount };
    }

    const textNode = element.firstChild as Text;
    let content = accessor(context.currData as ViewState);

    const updates: updateFunc<ViewState>[] = [];
    const mounts: MountFunc[] = [];
    const unmounts: MountFunc[] = [];

    updates.push((newData: ViewState) => {
        const newContent = accessor(newData);
        if (newContent !== content) {
            textNode.textContent = newContent as string;
        }
        content = newContent;
    });

    if (ref) {
        ref.set(element);
        updates.push(ref.update);
        mounts.push(ref.mount);
        unmounts.push(ref.unmount);
    }

    const result: BaseJayElement<ViewState> = {
        dom: element,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts),
    };

    // Register into the hydration collector so the root update propagates
    registerAdoptedElement(context, result);

    return result;
}

// ============================================================================
// adoptElement
// ============================================================================

/**
 * Adopt an existing element at the given coordinate, connecting dynamic
 * attributes and adopted children to it.
 *
 * This is the hydration counterpart to element()/dynamicElement() — instead of
 * creating a new DOM element, it adopts an existing one from server-rendered HTML
 * and wires up dynamic attribute bindings and children.
 *
 * The children parameter receives already-adopted children (e.g. from adoptText,
 * other adoptElement calls, hydrateForEach, etc.).
 */
export function adoptElement<ViewState>(
    coordinate: string,
    attributes: Attributes<ViewState>,
    children: BaseJayElement<ViewState>[] = [],
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState> {
    const context = currentConstructionContext();
    const element = context.resolveCoordinate(coordinate);

    if (!element) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
            console.warn(`[jay hydration] coordinate "${coordinate}" not found in DOM`);
        }
        return { dom: undefined as any, update: noopUpdate, mount: noopMount, unmount: noopMount };
    }

    const updates: updateFunc<ViewState>[] = [];
    const mounts: MountFunc[] = [];
    const unmounts: MountFunc[] = [];

    if (ref) {
        ref.set(element);
        updates.push(ref.update);
        mounts.push(ref.mount);
        unmounts.push(ref.unmount);
    }

    // Wire up dynamic attributes on the adopted element
    Object.entries(attributes).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'valueFunc' in value) {
            const dynAttr = value as { valueFunc: (vs: ViewState) => any; style: number };
            let attrValue = dynAttr.valueFunc(context.currData as ViewState);

            if (key === STYLE && element instanceof HTMLElement) {
                // Style bindings — value is a record of style properties
                // For adoptElement, STYLE attributes are handled at the top level
            } else {
                updates.push((newData: ViewState) => {
                    const newAttrValue = dynAttr.valueFunc(newData);
                    if (newAttrValue !== attrValue) {
                        element.setAttribute(key, newAttrValue as string);
                    }
                    attrValue = newAttrValue;
                });
            }
        }
    });

    // Collect updates/mounts from adopted children.
    // Remove child registrations from hydration collectors since this element
    // incorporates them (avoids double-firing on update).
    for (const child of children) {
        if (child.update !== noopUpdate) {
            updates.push(child.update);
            unregisterUpdate(context, child.update);
        }
        if (child.mount !== noopMount) {
            mounts.push(child.mount);
            unmounts.push(child.unmount);
            unregisterMount(context, child.mount, child.unmount);
        }
    }

    const result: BaseJayElement<ViewState> = {
        dom: element,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts),
    };

    // Register into the hydration collector so the root update propagates
    registerAdoptedElement(context, result);

    return result;
}

// ============================================================================
// hydrateConditional
// ============================================================================

/**
 * Hydration-aware conditional for if=true at SSR time (Level 2).
 *
 * The element exists in the DOM. We adopt it and wire up conditional toggling.
 * When the condition becomes false, the element is removed from its parent.
 * When it becomes true again, the same element is re-inserted at its original
 * position (using an anchor comment node).
 *
 * No creation code is needed — Jay retains the element on toggle.
 */
export function hydrateConditional<ViewState>(
    condition: (vs: ViewState) => boolean,
    adoptExisting: () => BaseJayElement<ViewState>,
): BaseJayElement<ViewState> {
    const context = currentConstructionContext();

    // Adopt the existing element
    const adopted = adoptExisting();

    if (!adopted.dom) {
        return adopted;
    }

    const dom = adopted.dom;
    const parent = dom.parentNode!;

    // Insert an anchor comment after the adopted element to remember position.
    // If the element is removed, re-inserting before the anchor restores order.
    const anchor = document.createComment('');
    parent.insertBefore(anchor, dom.nextSibling);

    let visible = true;

    const update = (newData: ViewState) => {
        const result = condition(newData);
        if (result && !visible) {
            parent.insertBefore(dom, anchor);
            adopted.mount();
        } else if (!result && visible) {
            parent.removeChild(dom);
            adopted.unmount();
        }
        if (result) {
            adopted.update(newData);
        }
        visible = result;
    };

    const result: BaseJayElement<ViewState> = {
        dom,
        update,
        mount: adopted.mount,
        unmount: adopted.unmount,
    };

    // Register into the hydration collector
    registerAdoptedElement(context, result);

    return result;
}

// ============================================================================
// hydrateForEach
// ============================================================================

/**
 * Hydration-aware forEach.
 *
 * Adopts existing items that were server-rendered, and creates new items via
 * the regular element creation path when the list changes.
 *
 * Uses a Kindergarten group for DOM ordering within the container element.
 * The container element is the parent of the first adopted item (the element
 * adopted by the parent adoptElement call).
 *
 * @param containerCoordinate - Coordinate of the container element (e.g. the <ul>)
 * @param accessor - Function to get the array from the ViewState
 * @param trackBy - Property name used for item identity (reconciliation key)
 * @param adoptItem - Called per existing item during hydration (should use adoptText/adoptElement)
 * @param createItem - Called per new item (regular element()/dynamicText() from generated-element.ts)
 */
export function hydrateForEach<ViewState, Item>(
    containerCoordinate: string,
    accessor: (vs: ViewState) => Item[],
    trackBy: string,
    adoptItem: () => BaseJayElement<Item>,
    createItem: (item: Item, id: string) => BaseJayElement<Item>,
): BaseJayElement<ViewState> {
    const context = currentConstructionContext();
    const savedContext = saveContext();
    const parentContext = context;

    // Get initial items from current ViewState
    const initialItems: Item[] = accessor(context.currData as ViewState) || [];

    // Adopt existing items. For each item:
    // 1. Resolve the item's root DOM element by its trackBy coordinate (BEFORE forItem scope)
    // 2. Create a forItem child context (which changes coordinateBase)
    // 3. Call adoptItem within that context (adopts inner elements like text, attributes)
    // 4. Build a BaseJayElement with dom = item root element, updates from adopted children
    const adoptedItems: BaseJayElement<Item>[] = [];
    for (const item of initialItems) {
        const id = String(item[trackBy]);

        // Resolve the item root element at the CURRENT scope (before forItem changes base)
        const itemDom = context.resolveCoordinate(id);

        const childContext = context.forItem(item, id);
        const adopted = withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () => {
            const innerElement = adoptItem();
            // Use the item's root DOM element (not the inner element's dom),
            // so Kindergarten can manage the whole item node
            return {
                dom: itemDom || innerElement.dom,
                update: innerElement.update,
                mount: innerElement.mount,
                unmount: innerElement.unmount,
            } as BaseJayElement<Item>;
        });
        adoptedItems.push(adopted);
    }

    // Resolve the container element by coordinate
    const containerElement = context.resolveCoordinate(containerCoordinate);

    if (!containerElement) {
        console.warn('[jay hydration] hydrateForEach: could not find container element');
        return { dom: undefined as any, update: noopUpdate, mount: noopMount, unmount: noopMount };
    }

    // Set up Kindergarten for the container
    const kindergarten = new Kindergarten(containerElement);
    const group = kindergarten.newGroup();

    // Pre-register existing item DOM nodes in the group (so offset counting works)
    for (const adopted of adoptedItems) {
        if (adopted.dom) {
            group.children.add(adopted.dom);
        }
    }

    // Build the initial list with adopted items as attachments for list-compare
    let lastItems: Item[] = initialItems;
    let lastItemsList = new List<Item, BaseJayElement<Item>>(initialItems, trackBy);

    for (let i = 0; i < initialItems.length; i++) {
        const id = String(initialItems[i][trackBy]);
        const node = lastItemsList.get(id);
        if (node) {
            node.attach = adoptedItems[i];
        }
    }

    const mount = () => {
        lastItemsList.forEach((_value, elem) => {
            if (elem && elem.mount !== noopMount) elem.mount();
        });
    };
    const unmount = () => {
        lastItemsList.forEach((_value, elem) => {
            if (elem && elem.unmount !== noopMount) elem.unmount();
        });
    };

    const update = (newData: ViewState) => {
        const items = accessor(newData) || [];
        const isModified = items !== lastItems;
        lastItems = items;

        if (isModified) {
            const itemsList = new List<Item, BaseJayElement<Item>>(items, trackBy);
            const instructions = listCompare<Item, BaseJayElement<Item>>(
                lastItemsList,
                itemsList,
                (item: Item, id: string) => {
                    // Create new items via the regular creation path
                    const childContext = parentContext.forItem(item, id);
                    return restoreContext(savedContext, () =>
                        withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () =>
                            wrapWithModifiedCheck(
                                currentConstructionContext().currData,
                                createItem(item, id),
                            ),
                        ),
                    );
                },
            );
            lastItemsList = itemsList;
            applyListChanges(group, instructions);
            itemsList.forEach((value, elem) => elem.update(value));
        }
    };

    const result: BaseJayElement<ViewState> = {
        dom: containerElement,
        update,
        mount,
        unmount,
    };

    // Register into the hydration collector
    registerAdoptedElement(context, result);

    return result;
}

/**
 * Apply list changes to the DOM via KindergartenGroup.
 * (Same logic as in element.ts but exported for hydration use.)
 */
function applyListChanges<Item>(
    group: KindergartenGroup,
    instructions: Array<MatchResult<Item, BaseJayElement<Item>>>,
) {
    instructions.forEach((instruction) => {
        if (instruction.action === ITEM_ADDED) {
            group.ensureNode(instruction.elem.dom, instruction.pos);
            instruction.elem.mount();
        } else if (instruction.action === ITEM_REMOVED) {
            group.removeNodeAt(instruction.pos);
            instruction.elem.unmount();
        } else {
            group.moveNode(instruction.fromPos, instruction.pos);
        }
    });
}

// ============================================================================
// Internal: register adopted element into hydration collectors
// ============================================================================

function registerAdoptedElement<VS>(
    context: ConstructContext<VS>,
    element: BaseJayElement<VS>,
): void {
    if (context._hydrationUpdates && element.update !== noopUpdate) {
        context._hydrationUpdates.push(element.update);
    }
    if (context._hydrationMounts && element.mount !== noopMount) {
        context._hydrationMounts.push(element.mount);
    }
    if (context._hydrationUnmounts && element.unmount !== noopMount) {
        context._hydrationUnmounts.push(element.unmount);
    }
}

function unregisterUpdate<VS>(
    context: ConstructContext<VS>,
    update: updateFunc<VS>,
): void {
    if (context._hydrationUpdates) {
        const idx = context._hydrationUpdates.indexOf(update);
        if (idx !== -1) context._hydrationUpdates.splice(idx, 1);
    }
}

function unregisterMount<VS>(
    context: ConstructContext<VS>,
    mount: MountFunc,
    unmount: MountFunc,
): void {
    if (context._hydrationMounts) {
        const idx = context._hydrationMounts.indexOf(mount);
        if (idx !== -1) context._hydrationMounts.splice(idx, 1);
    }
    if (context._hydrationUnmounts) {
        const idx = context._hydrationUnmounts.indexOf(unmount);
        if (idx !== -1) context._hydrationUnmounts.splice(idx, 1);
    }
}
