import { ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult } from '@jay-framework/list-compare';
import { RandomAccessLinkedList as List } from '@jay-framework/list-compare';
import { Kindergarten, KindergartenGroup } from './kindergarden';
import {
    CONSTRUCTION_CONTEXT_MARKER,
    currentConstructionContext,
    restoreContext,
    saveContext,
    withContext,
    wrapWithModifiedCheck,
} from './context';
import {
    BaseJayElement,
    JayComponent,
    JayComponentConstructor,
    MountFunc,
    updateFunc,
    noopMount,
    noopUpdate,
} from './element-types';
import { normalizeMount, normalizeUpdates, type Attributes } from './element';
import type { PrivateRef } from './node-reference';

const STYLE = 'style';

/**
 * Sentinel value for static children in adoptDynamicElement.
 * Represents a child position occupied by a pre-existing DOM node
 * that has no hydration code (no dynamic text, no dynamic attributes, no refs).
 */
export const STATIC = Symbol('STATIC');

/** Element returned by hydrateForEach/hydrateConditional that needs a group assigned later. */
export type DynamicChild<ViewState> = BaseJayElement<ViewState> & {
    _setGroup: (group: KindergartenGroup) => void;
};

// ============================================================================
// adoptText
// ============================================================================

/**
 * Get the index-th significant child of an element.
 * Matches compiler filtering: when element has multiple children, skip whitespace-only text nodes.
 */
function getSignificantChild(element: Element, index: number): ChildNode | undefined {
    const nodes = element.childNodes;
    if (nodes.length <= 1) return nodes[index] as ChildNode | undefined;
    let i = 0;
    for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent || '').trim() !== '') {
            if (i === index) return node;
            i++;
        }
    }
    return undefined;
}

/**
 * Adopt an existing text node inside the element at the given coordinate.
 *
 * Reads the current ConstructContext from the stack (via currentConstructionContext())
 * to resolve the coordinate to an existing DOM element. Finds the text child at
 * the given index (by significant-child position) and connects a dynamic text updater.
 *
 * - coordinate: element containing the text (or parent in mixed content)
 * - accessor: (vs) => string | number | boolean
 * - ref?: optional ref for the element
 * - childIndex?: index among significant children (default 0). Use when parent has
 *   mixed content (text + elements); matches element target's positional dynamicText.
 */
export function adoptText<ViewState>(
    coordinate: string,
    accessor: (vs: ViewState) => string | number | boolean,
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
    childIndex?: number,
): BaseJayElement<ViewState> {
    const context = currentConstructionContext();
    // Use peekCoordinate so we don't consume — adoptElement (parent) may need the same coordinate
    const element = context.peekCoordinate(coordinate);

    if (!element) {
        console.warn(`[jay hydration] adoptText coordinate "${coordinate}" not found in DOM`);
        return { dom: undefined as any, update: noopUpdate, mount: noopMount, unmount: noopMount };
    }

    const index = childIndex ?? 0;
    const textNode = getSignificantChild(element, index);
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        console.warn(
            `[jay hydration] adoptText(${coordinate}, childIndex=${index}): expected text node`,
        );
        return { dom: undefined as any, update: noopUpdate, mount: noopMount, unmount: noopMount };
    }

    // Initialize content from the DOM text (not the accessor) so the first
    // update detects if the ViewState differs from the SSR-rendered text.
    let content: string | number | boolean = textNode.textContent ?? '';

    const updates: updateFunc<ViewState>[] = [];
    const mounts: MountFunc[] = [];
    const unmounts: MountFunc[] = [];

    updates.push((newData: ViewState) => {
        const newContent = accessor(newData);
        if (newContent !== content) {
            textNode.textContent = String(newContent);
        }
        content = newContent;
    });

    if (ref) {
        ref.set(element);
        updates.push(ref.update);
        mounts.push(ref.mount);
        unmounts.push(ref.unmount);
    }

    return {
        dom: element,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts),
    };
}

// ============================================================================
// adoptElement / adoptDynamicElement — shared core
// ============================================================================

const NOOP_ELEMENT: BaseJayElement<any> = {
    dom: undefined as any,
    update: noopUpdate,
    mount: noopMount,
    unmount: noopMount,
};

/** Resolve coordinate, wire ref + dynamic attributes. Returns null if coordinate missing. */
function adoptBase<ViewState>(
    coordinate: string,
    attributes: Attributes<ViewState>,
    ref: PrivateRef<ViewState, BaseJayElement<ViewState>> | undefined,
): {
    element: Element;
    updates: updateFunc<ViewState>[];
    mounts: MountFunc[];
    unmounts: MountFunc[];
} | null {
    const context = currentConstructionContext();
    const element = context.resolveCoordinate(coordinate);

    if (!element) {
        console.warn(`[jay hydration] adoptBase coordinate "${coordinate}" not found in DOM`);
        return null;
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

    Object.entries(attributes).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'valueFunc' in value) {
            const dynAttr = value as { valueFunc: (vs: ViewState) => any; style: number };
            let attrValue = dynAttr.valueFunc(context.currData as ViewState);

            if (!(key === STYLE && element instanceof HTMLElement)) {
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

    return { element, updates, mounts, unmounts };
}

/** Collect update/mount/unmount from a child element. */
function collectChild<ViewState>(
    child: BaseJayElement<ViewState>,
    updates: updateFunc<ViewState>[],
    mounts: MountFunc[],
    unmounts: MountFunc[],
) {
    if (child.update !== noopUpdate) updates.push(child.update);
    if (child.mount !== noopMount) mounts.push(child.mount);
    if (child.unmount !== noopMount) unmounts.push(child.unmount);
}

/**
 * Adopt an existing element at the given coordinate, connecting dynamic
 * attributes and adopted children to it.
 *
 * Hydration counterpart to element() — adopts server-rendered HTML and wires
 * up dynamic attribute bindings and children.
 */
export function adoptElement<ViewState>(
    coordinate: string,
    attributes: Attributes<ViewState>,
    children: BaseJayElement<ViewState>[] = [],
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState> {
    const base = adoptBase(coordinate, attributes, ref);
    if (!base) return NOOP_ELEMENT;
    const { element, updates, mounts, unmounts } = base;

    for (const child of children) {
        collectChild(child, updates, mounts, unmounts);
    }

    return {
        dom: element,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts),
    };
}

/**
 * Adopt an existing element that has interactive children (forEach/conditional).
 *
 * Creates one Kindergarten per parent, one group per child position.
 * STATIC sentinels represent children with no hydrate code.
 * Children with `_setGroup` (forEach/conditional) receive their group via callback.
 */
export function adoptDynamicElement<ViewState>(
    coordinate: string,
    attributes: Attributes<ViewState>,
    children: (BaseJayElement<ViewState> | typeof STATIC)[] = [],
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState> {
    const base = adoptBase(coordinate, attributes, ref);
    if (!base) return NOOP_ELEMENT;
    const { element, updates, mounts, unmounts } = base;

    const kindergarten = new Kindergarten(element);
    const significantChildren = getSignificantChildren(element);
    let significantIndex = 0;

    for (const child of children) {
        const group = kindergarten.newGroup();

        if (child === STATIC) {
            const domNode = significantChildren[significantIndex];
            if (domNode) group.children.add(domNode);
            significantIndex++;
        } else if ('_setGroup' in child) {
            (child as DynamicChild<ViewState>)._setGroup(group);
            collectChild(child, updates, mounts, unmounts);
        } else {
            if (child.dom) group.children.add(child.dom);
            collectChild(child, updates, mounts, unmounts);
            significantIndex++;
        }
    }

    return {
        dom: element,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts),
    };
}

/**
 * Get all significant children of an element (non-whitespace-only nodes).
 * Matches the compiler's filtering of whitespace text nodes.
 */
function getSignificantChildren(element: Element): ChildNode[] {
    const nodes = element.childNodes;
    if (nodes.length <= 1) return Array.from(nodes);
    const result: ChildNode[] = [];
    for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent || '').trim() !== '') {
            result.push(node);
        }
    }
    return result;
}

// ============================================================================
// hydrateConditional
// ============================================================================

/**
 * Hydration-aware conditional.
 *
 * Returns an element with `_setGroup` callback. The parent `adoptDynamicElement`
 * calls `_setGroup` to assign a KindergartenGroup, which is used for DOM
 * positioning (ensureNode/removeNode) instead of anchor comments.
 *
 * Handles two cases:
 * - **True at SSR**: Element exists in DOM. Adopt it, register in group, wire toggle.
 * - **False at SSR**: Element absent. Use createFallback to lazily create when true.
 */
export function hydrateConditional<ViewState>(
    condition: (vs: ViewState) => boolean,
    adoptExisting: () => BaseJayElement<ViewState>,
    createFallback?: () => BaseJayElement<ViewState>,
): DynamicChild<ViewState> {
    const adopted = adoptExisting();

    const context = currentConstructionContext();
    const savedContext = saveContext();

    // Determine if condition was true at SSR (element exists in DOM)
    const wasTrue = adopted && adopted.dom;

    let group: KindergartenGroup | undefined;
    let created: BaseJayElement<ViewState> | undefined = wasTrue ? adopted : undefined;
    let visible = !!wasTrue;

    // For false-at-SSR: check if condition is already true (data arrived between SSR and hydration)
    if (!wasTrue && createFallback) {
        const currData = context.currData as ViewState;
        const initialResult = currData != null && condition(currData);
        if (initialResult) {
            created = wrapWithModifiedCheck(context.currData, createFallback());
            visible = true;
        }
    }

    const update = (newData: ViewState) => {
        if (!group) return;
        const result = condition(newData);

        // Lazy creation: build the element on first true
        if (!created && result) {
            if (wasTrue) {
                // This shouldn't happen — if wasTrue, created is set above
            } else if (createFallback) {
                restoreContext(savedContext, () => {
                    created = wrapWithModifiedCheck(
                        currentConstructionContext().currData,
                        createFallback(),
                    );
                });
            }
        }

        if (result && !visible && created) {
            group.ensureNode(created.dom);
            created.mount();
        } else if (!result && visible && created) {
            group.removeNode(created.dom);
            created.unmount();
        }
        if (result && created) {
            created.update(newData);
        }
        visible = result;
    };

    const result: DynamicChild<ViewState> = {
        dom: (wasTrue ? adopted.dom : undefined) as any,
        update,
        mount: () => {
            if (created && visible) created.mount();
        },
        unmount: () => {
            if (created && visible) created.unmount();
        },
        _setGroup: (g: KindergartenGroup) => {
            group = g;
            // Register existing DOM node in the group if condition was true at SSR
            if (wasTrue && adopted.dom) {
                group.children.add(adopted.dom);
            }
            // If created immediately (false-at-SSR but condition now true), insert into DOM
            if (created && visible && !wasTrue) {
                group.ensureNode(created.dom);
            }
        },
    };

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
 * Returns an element with `_setGroup` callback. The parent `adoptDynamicElement`
 * calls `_setGroup` to assign a KindergartenGroup from the parent's Kindergarten,
 * ensuring correct DOM positioning relative to siblings.
 *
 * @param accessor - Function to get the array from the ViewState
 * @param trackBy - Property name used for item identity (reconciliation key)
 * @param adoptItem - Called per existing item during hydration (should use adoptText/adoptElement)
 * @param createItem - Called per new item (regular element()/dynamicText() from generated-element.ts)
 */
export function hydrateForEach<ViewState, Item>(
    accessor: (vs: ViewState) => Item[],
    trackBy: string,
    adoptItem: () => BaseJayElement<Item>[],
    createItem: (item: Item, id: string) => BaseJayElement<Item>,
): DynamicChild<ViewState> {
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
            const elements = adoptItem();
            // Combine array of adopted elements into a single BaseJayElement
            const updates: updateFunc<Item>[] = [];
            const mounts: MountFunc[] = [];
            const unmounts: MountFunc[] = [];
            for (const el of elements) {
                if (el.update !== noopUpdate) updates.push(el.update);
                if (el.mount !== noopMount) mounts.push(el.mount);
                if (el.unmount !== noopMount) unmounts.push(el.unmount);
            }
            return {
                dom: itemDom || elements[0]?.dom,
                update: normalizeUpdates(updates),
                mount: normalizeMount(mounts),
                unmount: normalizeMount(unmounts),
            } as BaseJayElement<Item>;
        });
        adoptedItems.push(adopted);
    }

    // Group will be assigned by adoptDynamicElement via _setGroup
    let group: KindergartenGroup | undefined;

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
        if (!group) return;
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

    const result: DynamicChild<ViewState> = {
        dom: undefined as any,
        update,
        mount,
        unmount,
        _setGroup: (g: KindergartenGroup) => {
            group = g;
            // Pre-register existing item DOM nodes in the group (so offset counting works)
            for (const adopted of adoptedItems) {
                if (adopted.dom) {
                    group.children.add(adopted.dom);
                }
            }
        },
    };

    return result;
}

// ============================================================================
// childCompHydrate
// ============================================================================

/**
 * Hydration-aware child component instantiation.
 *
 * Like childComp, but extends the current ConstructContext's coordinateBase
 * with the instance's coordinate key before calling the component factory.
 * This scopes coordinate resolution so that adoptElement('0') inside the
 * child's inline template resolves to '{instanceCoordinate}/0' in the
 * page's coordinate map.
 *
 * Used for headless component instances during hydration. The child
 * component's preRender calls ConstructContext.withHydrationChildContext()
 * which inherits the scoped coordinateBase.
 *
 * @param compCreator - Component factory (from makeHeadlessInstanceComponent)
 * @param getProps - Extracts component props from parent ViewState
 * @param instanceCoordinate - The instance's coordinate key (e.g., 'product-card:0')
 * @param ref - Optional ref for the component instance
 */
export function childCompHydrate<
    ParentVS,
    Props,
    ChildT,
    ChildElement extends BaseJayElement<ChildT>,
    ChildComp extends JayComponent<Props, ChildT, ChildElement>,
>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentVS) => Props,
    instanceCoordinate: string,
    ref?: PrivateRef<ParentVS, ChildComp>,
): BaseJayElement<ParentVS> {
    const context = currentConstructionContext();
    const childContext = context.forInstance(instanceCoordinate);

    // Run the component factory within the scoped context
    return withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () => {
        const childComp = compCreator(getProps(context.currData as ParentVS));
        const updates: updateFunc<ParentVS>[] = [(t: ParentVS) => childComp.update(getProps(t))];
        const mounts: MountFunc[] = [childComp.mount];
        const unmounts: MountFunc[] = [childComp.unmount];
        if (ref) {
            updates.push(ref.update);
            ref.set(childComp as any);
            mounts.push(ref.mount);
            unmounts.push(ref.unmount);
        }
        return {
            dom: childComp.element.dom,
            update: normalizeUpdates(updates),
            mount: normalizeMount(mounts),
            unmount: normalizeMount(unmounts),
        };
    });
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
