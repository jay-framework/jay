import { Kindergarten, KindergartenGroup } from './kindergarden';
import { ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult } from '@jay-framework/list-compare';
import { RandomAccessLinkedList as List } from '@jay-framework/list-compare';
import {
    BaseJayElement,
    JayComponent,
    JayComponentConstructor,
    jayLog,
    LogType,
    MountFunc,
    noopMount,
    noopUpdate,
    updateFunc,
} from './element-types';
import './element-test-types';
import {
    CONSTRUCTION_CONTEXT_MARKER,
    currentConstructionContext,
    withContext,
    restoreContext,
    saveContext,
    wrapWithModifiedCheck,
} from './context';
import { PrivateRef } from './node-reference';

const STYLE = 'style';

function mkRef<ViewState>(
    ref: PrivateRef<ViewState, any>,
    referenced: Element | JayComponent<any, ViewState, any>,
    updates: updateFunc<ViewState>[],
    mounts: MountFunc[],
    unmounts: MountFunc[],
) {
    updates.push(ref.update);
    ref.set(referenced);
    mounts.push(ref.mount);
    unmounts.push(ref.unmount);
}

export function childComp<
    ParentVS,
    Props,
    ChildT,
    ChildElement extends BaseJayElement<ChildT>,
    ChildComp extends JayComponent<Props, ChildT, ChildElement>,
>(
    compCreator: JayComponentConstructor<Props>,
    getProps: (t: ParentVS) => Props,
    ref?: PrivateRef<ParentVS, ChildComp>,
): BaseJayElement<ParentVS> {
    let context = currentConstructionContext();
    let childComp = compCreator(getProps(context.currData));
    let updates: updateFunc<ParentVS>[] = [(t: ParentVS) => childComp.update(getProps(t))];
    let mounts: MountFunc[] = [childComp.mount];
    let unmounts: MountFunc[] = [childComp.unmount];
    if (ref) {
        mkRef(ref, childComp, updates, mounts, unmounts);
    }
    return {
        dom: childComp.element.dom,
        update: normalizeUpdates(updates),
        mount: normalizeMount(mounts),
        unmount: normalizeMount(unmounts),
    };
}

export interface TextElement<ViewState> {
    dom: Text;
    update: updateFunc<ViewState>;
    mount: MountFunc;
    unmount: MountFunc;
}

const PROPERTY = 1,
    ATTRIBUTE = 2,
    BOOLEAN_ATTRIBUTE = 3;
type AttributeStyle = typeof PROPERTY | typeof ATTRIBUTE | typeof BOOLEAN_ATTRIBUTE;
export interface DynamicAttributeOrProperty<ViewState, S> {
    valueFunc: (data: ViewState) => S;
    style: AttributeStyle;
}

function isDynamicAttributeOrProperty<ViewState, S>(
    value: any,
): value is DynamicAttributeOrProperty<ViewState, S> {
    return typeof value.valueFunc === 'function';
}

export function dynamicAttribute<ViewState>(
    attributeValue: (data: ViewState) => string,
): DynamicAttributeOrProperty<ViewState, string> {
    return { valueFunc: attributeValue, style: ATTRIBUTE };
}

export function dynamicProperty<ViewState, S>(
    propertyValue: (data: ViewState) => S,
): DynamicAttributeOrProperty<ViewState, S> {
    return { valueFunc: propertyValue, style: PROPERTY };
}

export function booleanAttribute<ViewState, S>(
    propertyValue: (data: ViewState) => S,
): DynamicAttributeOrProperty<ViewState, S> {
    return { valueFunc: propertyValue, style: BOOLEAN_ATTRIBUTE };
}

export type Attribute<ViewState, S> =
    | string
    | DynamicAttributeOrProperty<ViewState, S>
    | Record<string, string | DynamicAttributeOrProperty<ViewState, S>>;
export type Attributes<ViewState> = Record<string, Attribute<ViewState, any>>;

function doSetAttribute<S>(
    target: Element | CSSStyleDeclaration,
    key: string,
    value: S,
    attributeStyle: AttributeStyle,
) {
    const isHTMLElement = target instanceof Element;
    if (isHTMLElement && attributeStyle === ATTRIBUTE) {
        target.setAttribute(key, value as unknown as string);
    } else if (isHTMLElement && attributeStyle === BOOLEAN_ATTRIBUTE) {
        if (value) target.setAttribute(key, value as unknown as string);
        else target.removeAttribute(key);
    } else target[key] = value;
}

function setAttribute<ViewState, S>(
    target: Element | CSSStyleDeclaration,
    key: string,
    value: string | DynamicAttributeOrProperty<ViewState, S>,
    updates: updateFunc<ViewState>[],
) {
    if (isDynamicAttributeOrProperty(value)) {
        let context = currentConstructionContext();
        let attributeValue = value.valueFunc(context.currData);
        doSetAttribute(target, key, attributeValue, value.style);
        updates.push((newData: ViewState) => {
            let newAttributeValue = value.valueFunc(newData);
            if (newAttributeValue !== attributeValue)
                doSetAttribute(target, key, newAttributeValue, value.style);
            attributeValue = newAttributeValue;
        });
    } else doSetAttribute(target, key, value, ATTRIBUTE);
}

export function conditional<ViewState>(
    condition: (newData: ViewState) => boolean,
    elem: () => BaseJayElement<ViewState> | TextElement<ViewState> | string,
): Conditional<ViewState> {
    return {
        condition,
        elem: () => {
            const createdElem = elem();
            return typeof createdElem === 'string' ? text(createdElem) : createdElem;
        },
    };
}

export interface Conditional<ViewState> {
    condition: (newData: ViewState) => boolean;
    elem: () => BaseJayElement<ViewState> | TextElement<ViewState>;
}

export enum WhenRole {
    pending,
    resolved,
    rejected,
}
export interface When<ViewState, ResolvedViewValue> {
    role: WhenRole;
    promise: (newData: ViewState) => Promise<ResolvedViewValue>;
    elem: () => BaseJayElement<ResolvedViewValue> | TextElement<ResolvedViewValue> | string;
}

function when<ViewState, ResolvedViewValue>(
    status: WhenRole,
    promise: (newData: ViewState) => Promise<ResolvedViewValue>,
    elem: () => BaseJayElement<ResolvedViewValue> | TextElement<ResolvedViewValue> | string,
): When<ViewState, ResolvedViewValue> {
    return {
        role: status,
        promise,
        elem,
    };
}

export const resolved = <ViewState, ResolvedViewValue>(
    promise: (newData: ViewState) => Promise<ResolvedViewValue>,
    elem: () => BaseJayElement<ResolvedViewValue> | TextElement<ResolvedViewValue> | string,
) => when(WhenRole.resolved, promise, elem);
export const rejected = <ViewState>(
    promise: (newData: ViewState) => Promise<any>,
    elem: () => BaseJayElement<Error> | TextElement<Error> | string,
) => when(WhenRole.rejected, promise, elem);
export const pending = <ViewState>(
    promise: (newData: ViewState) => Promise<any>,
    elem: () => BaseJayElement<never> | TextElement<never> | string,
) => when(WhenRole.pending, promise, elem);

function isJayElement<ViewState>(
    c:
        | Conditional<ViewState>
        | When<ViewState, any>
        | ForEach<ViewState, any>
        | WithData<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is BaseJayElement<ViewState> {
    return (c as BaseJayElement<ViewState>).mount !== undefined;
}
export function isCondition<ViewState>(
    c:
        | Conditional<ViewState>
        | When<ViewState, any>
        | ForEach<ViewState, any>
        | WithData<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is Conditional<ViewState> {
    return (c as Conditional<ViewState>).condition !== undefined;
}

export function isForEach<ViewState, Item>(
    c:
        | Conditional<ViewState>
        | When<ViewState, any>
        | ForEach<ViewState, Item>
        | WithData<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is ForEach<ViewState, Item> {
    return (c as ForEach<ViewState, Item>).elemCreator !== undefined;
}

export function isWhen<ViewState, Item>(
    c:
        | Conditional<ViewState>
        | When<ViewState, any>
        | ForEach<ViewState, Item>
        | WithData<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is When<ViewState, any> {
    return (c as When<ViewState, any>).promise !== undefined;
}

export function isWithData<ViewState, ChildViewState>(
    c:
        | Conditional<ViewState>
        | When<ViewState, any>
        | ForEach<ViewState, any>
        | WithData<ViewState, ChildViewState>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is WithData<ViewState, ChildViewState> {
    return (c as WithData<ViewState, ChildViewState>).accessor !== undefined;
}

function mkWhenCondition<ViewState, Resolved>(
    when: When<ViewState, Resolved>,
    group: KindergartenGroup,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    switch (when.role) {
        case WhenRole.resolved:
            return mkWhenResolvedCondition(when, group);
        case WhenRole.rejected:
            return mkWhenRejectedCondition(when, group);
        default:
            return mkWhenPendingCondition(when, group);
    }
}

const Hide = Symbol();
type SetupPromise = (
    promise: Promise<any>,
    handleValue: (value: any | typeof Hide) => void,
) => void;

function mkWhenConditionBase<ViewState, Resolved>(
    when: When<ViewState, Resolved>,
    group: KindergartenGroup,
    setupPromise: SetupPromise,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    let show = false;
    let savedValue = undefined;
    const parentContext = currentConstructionContext();
    const savedContext = saveContext();
    const [cUpdate, cMouth, cUnmount] = mkUpdateCondition(
        conditional(
            () => show,
            () => {
                let childContext = parentContext.forAsync(savedValue);
                return restoreContext(savedContext, () => {
                    return withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () => {
                        return when.elem();
                    });
                });
            },
        ),
        group,
    );

    let currentPromise = when.promise(parentContext.currData);

    const handleValue = (changedPromise: Promise<Resolved>) => (value: any | typeof Hide) => {
        if (changedPromise === currentPromise) {
            show = value !== Hide;
            savedValue = value;
            cUpdate(value);
        }
    };

    setupPromise(currentPromise, handleValue(currentPromise));

    const update = (viewState: ViewState) => {
        const newValue = when.promise(viewState);
        if (currentPromise !== newValue) {
            currentPromise = newValue;
            setupPromise(currentPromise, handleValue(currentPromise));
            show = false;
            restoreContext(savedContext, () => cUpdate(undefined));
        }
    };
    return [update, cMouth, cUnmount];
}

function mkWhenResolvedCondition<ViewState, Resolved>(
    when: When<ViewState, Resolved>,
    group: KindergartenGroup,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    return mkWhenConditionBase(when, group, (promise, handleValue) =>
        promise.then(handleValue).catch((err) => jayLog.error(LogType.ASYNC_ERROR, err)),
    );
}

function mkWhenRejectedCondition<ViewState, Resolved>(
    when: When<ViewState, Resolved>,
    group: KindergartenGroup,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    return mkWhenConditionBase(when, group, (promise, handleValue) => promise.catch(handleValue));
}

function mkWhenPendingCondition<ViewState>(
    when: When<ViewState, any>,
    group: KindergartenGroup,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    let timeout: ReturnType<typeof setTimeout>;
    return mkWhenConditionBase(when, group, (promise, handleValue) => {
        timeout = setTimeout(() => handleValue(undefined), 1);
        promise
            .finally(() => {
                clearTimeout(timeout);
                handleValue(Hide);
            })
            .catch((err) => jayLog.error(LogType.ASYNC_ERROR, err));
    });
}

export function forEach<T, Item>(
    getItems: (T) => Array<Item>,
    elemCreator: (Item) => BaseJayElement<Item>,
    matchBy: string,
): ForEach<T, Item> {
    return { getItems, elemCreator, trackBy: matchBy };
}

/**
 * Runtime support for pre-rendered slow arrays (slowForEach in jay-html).
 *
 * This function is used when a forEach loop has been pre-rendered at slow phase.
 * The array items are statically embedded in the jay-html, but we still need to:
 * 1. Set up the correct data context for each item (so bindings work)
 * 2. Enable fast/interactive updates within each item
 * 3. Support event handling with the correct item coordinates
 *
 * The key insight is that slowForEachItem switches the data context to the
 * specific array item, so child bindings like {price} work correctly
 * (they resolve to item.price, not viewState.price).
 *
 * @param arrayName - The property name of the array in the parent ViewState
 * @param index - The jayIndex value (position in the pre-rendered array)
 * @param trackByValue - The jayTrackBy value (identity for reconciliation)
 * @param elementCreator - Function that creates the pre-rendered element (called within item context)
 */
export function slowForEachItem<ParentVS, ItemVS>(
    arrayName: keyof ParentVS,
    index: number,
    trackByValue: string,
    elementCreator: () => BaseJayElement<ItemVS>,
): BaseJayElement<ParentVS> {
    // Get the parent construction context
    const parentContext = currentConstructionContext();
    const savedContext = saveContext();

    // Get the initial item from the array (may be undefined if array is missing or shorter than expected)
    const parentData = parentContext.currData as ParentVS;
    const array = parentData[arrayName] as ItemVS[];
    const initialItem = array?.[index];

    // Create a child context for this item and construct the element within it
    const childContext = parentContext.forItem(initialItem, trackByValue);
    const element = withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, elementCreator);

    // Wrap the element with context-aware update
    const originalUpdate = element.update;
    const update: updateFunc<ParentVS> = (newParentData: ParentVS) => {
        const newArray = newParentData[arrayName] as ItemVS[];
        const newItem = newArray?.[index];

        // Update with item data in the correct context
        const updateChildContext = parentContext.forItem(newItem, trackByValue);
        restoreContext(savedContext, () =>
            withContext(CONSTRUCTION_CONTEXT_MARKER, updateChildContext, () => {
                originalUpdate(newItem);
            }),
        );
    };

    return {
        dom: element.dom,
        update,
        mount: element.mount,
        unmount: element.unmount,
    };
}

export interface ForEach<ViewState, Item> {
    getItems: (T) => Array<Item>;
    elemCreator: (Item, String) => BaseJayElement<Item>;
    trackBy: string;
}

export function withData<ParentViewState, ChildViewState>(
    accessor: (data: ParentViewState) => ChildViewState | null | undefined,
    elem: () => BaseJayElement<ChildViewState>,
): WithData<ParentViewState, ChildViewState> {
    return { accessor, elem };
}

export interface WithData<ParentViewState, ChildViewState> {
    accessor: (data: ParentViewState) => ChildViewState | null | undefined;
    elem: () => BaseJayElement<ChildViewState>;
}

function applyListChanges<Item>(
    group: KindergartenGroup,
    instructions: Array<MatchResult<Item, BaseJayElement<Item>>>,
) {
    // todo add update
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

export function mkUpdateCollection<ViewState, Item>(
    child: ForEach<ViewState, Item>,
    group: KindergartenGroup,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    let lastItems = [];
    let lastItemsList = new List<Item, BaseJayElement<Item>>([], child.trackBy);
    let mount = () => lastItemsList.forEach((value, attach) => attach.mount);
    let unmount = () => lastItemsList.forEach((value, attach) => attach.unmount);
    // todo handle data updates of the parent contexts
    let parentContext = currentConstructionContext();
    let savedContext = saveContext();
    const update = (newData: ViewState) => {
        const items = child.getItems(newData) || [];
        let isModified = items !== lastItems;
        lastItems = items;
        if (isModified) {
            let itemsList = new List<Item, BaseJayElement<Item>>(items, child.trackBy);
            let instructions = listCompare<Item, BaseJayElement<Item>>(
                lastItemsList,
                itemsList,
                (item, id) => {
                    let childContext = parentContext.forItem(item, id);
                    return restoreContext(savedContext, () =>
                        withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () =>
                            wrapWithModifiedCheck(
                                currentConstructionContext().currData,
                                child.elemCreator(item, id),
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
    return [update, mount, unmount];
}

function mkUpdateCondition<ViewState>(
    child: Conditional<ViewState>,
    group: KindergartenGroup,
): [updateFunc<ViewState>, MountFunc, MountFunc] {
    let mount = noopMount,
        unmount = noopMount;
    let lastResult = false;
    let childElement: BaseJayElement<ViewState> | TextElement<ViewState> = undefined;
    const savedContext = saveContext();
    const update = (newData: ViewState) => {
        const result = child.condition(newData);
        if (!childElement && result) {
            restoreContext(savedContext, () => {
                childElement = child.elem();
            });
            mount = () => lastResult && childElement.mount();
            unmount = () => childElement.unmount();
        }

        if (result) {
            if (!lastResult) {
                group.ensureNode(childElement.dom);
                childElement.mount();
            }
            childElement.update(newData);
        } else if (lastResult) {
            group.removeNode(childElement.dom);
            childElement.unmount();
        }
        lastResult = result;
    };
    return [update, mount, unmount];
}

function mkUpdateWithData<ParentViewState, ChildViewState>(
    child: WithData<ParentViewState, ChildViewState>,
    group: KindergartenGroup,
): [updateFunc<ParentViewState>, MountFunc, MountFunc] {
    let mount = noopMount,
        unmount = noopMount;
    let lastResult = false;
    let childElement: BaseJayElement<ChildViewState> | undefined = undefined;
    const parentContext = currentConstructionContext();
    const savedContext = saveContext();

    const update = (newData: ParentViewState) => {
        const childData = child.accessor(newData);
        const result = childData != null;

        // Construct the child element when first needed
        if (!childElement && result) {
            const childContext = parentContext.forAsync(childData);
            childElement = restoreContext(savedContext, () =>
                withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () => child.elem()),
            );
            mount = () => lastResult && childElement!.mount();
            unmount = () => childElement!.unmount();
        }

        // Handle mounting/unmounting based on condition
        if (result) {
            if (!lastResult) {
                group.ensureNode(childElement!.dom);
                childElement!.mount();
            }
            // Update child with child data, not parent data
            const childContext = parentContext.forAsync(childData);
            restoreContext(savedContext, () =>
                withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () =>
                    childElement!.update(childData!),
                ),
            );
        } else if (lastResult) {
            childElement!.unmount();
            group.removeNode(childElement!.dom);
        }

        lastResult = result;
    };

    return [update, mount, unmount];
}

function text<ViewState>(content: string): TextElement<ViewState> {
    return {
        dom: document.createTextNode(content),
        update: noopUpdate,
        mount: noopMount,
        unmount: noopMount,
    };
}

export function dynamicText<ViewState>(
    textContent: (vs: ViewState) => string | number | boolean,
): TextElement<ViewState> {
    let context = currentConstructionContext();
    let content = textContent(context.currData);
    // we rely here on the default JS conversion from number abd boolean to string
    let n = document.createTextNode(content as string);
    return {
        dom: n,
        update: (newData: ViewState) => {
            let newContent = textContent(newData);
            if (newContent !== content) n.textContent = newContent as string;
            content = newContent;
        },
        mount: noopMount,
        unmount: noopMount,
    };
}

type ElementChildren<ViewState> = Array<
    BaseJayElement<ViewState> | TextElement<ViewState> | string
>;
const elementNS =
    (ns: string) =>
    <ViewState>(
        tagName: string,
        attributes: Attributes<ViewState>,
        children: ElementChildren<ViewState> = [],
        ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
    ): BaseJayElement<ViewState> => {
        let { e, updates, mounts, unmounts } = createBaseElement(ns, tagName, attributes, ref);

        children.forEach((child) => {
            if (typeof child === 'string') child = text(child);
            e.append(child.dom);
            if (child.update !== noopUpdate) updates.push(child.update);
            if (child.mount !== noopMount) {
                mounts.push(child.mount);
                unmounts.push(child.unmount);
            }
        });
        return {
            dom: e,
            update: normalizeUpdates(updates),
            mount: normalizeMount(mounts),
            unmount: normalizeMount(unmounts),
        };
    };

const HTML = 'http://www.w3.org/1999/xhtml';
const SVG = 'http://www.w3.org/2000/svg';
const MathML = 'http://www.w3.org/1998/Math/MathML';
export const element = elementNS(HTML);
export const svgElement = elementNS(SVG);
export const mathMLElement = elementNS(MathML);

type DynamicElementChildren<ViewState> = Array<
    | Conditional<ViewState>
    | ForEach<ViewState, any>
    | WithData<ViewState, any>
    | TextElement<ViewState>
    | BaseJayElement<ViewState>
    | When<ViewState, any>
    | string
>;

export const dynamicElementNS =
    (ns: string) =>
    <ViewState>(
        tagName: string,
        attributes: Attributes<ViewState>,
        children: DynamicElementChildren<ViewState> = [],
        ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
    ): BaseJayElement<ViewState> => {
        let { e, updates, mounts, unmounts } = createBaseElement(ns, tagName, attributes, ref);

        let kindergarten = new Kindergarten(e);
        children.forEach((child) => {
            if (typeof child === 'string') child = text(child);
            let group = kindergarten.newGroup();
            let update = noopUpdate,
                mount = noopMount,
                unmount = noopMount;
            if (isCondition(child)) {
                [update, mount, unmount] = mkUpdateCondition(child, group);
            } else if (isForEach(child)) {
                [update, mount, unmount] = mkUpdateCollection(child, group);
            } else if (isWithData(child)) {
                [update, mount, unmount] = mkUpdateWithData(child, group);
            } else if (isWhen(child)) {
                [update, mount, unmount] = mkWhenCondition(child, group);
            } else {
                group.ensureNode(child.dom);
                if (child.update !== noopUpdate) update = child.update;
                if (child.mount !== noopMount) {
                    mount = child.mount;
                    unmount = child.unmount;
                }
            }

            if (update !== noopUpdate) {
                let context = currentConstructionContext();
                update(context.currData);
                updates.push(update);
            }

            if (mount !== noopMount) {
                mounts.push(mount);
                unmounts.push(unmount);
            }
        });

        return {
            dom: e,
            update: normalizeUpdates(updates),
            mount: normalizeMount(mounts),
            unmount: normalizeMount(unmounts),
        };
    };

export const dynamicElement = dynamicElementNS(HTML);
export const svgDynamicElement = dynamicElementNS(SVG);
export const mathMLDynamicElement = dynamicElementNS(MathML);

function createBaseElement<ViewState>(
    ns: string,
    tagName: string,
    attributes: Attributes<ViewState>,
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): {
    e: Element;
    updates: updateFunc<ViewState>[];
    mounts: MountFunc[];
    unmounts: MountFunc[];
} {
    let e = document.createElementNS(ns, tagName);
    let updates: updateFunc<ViewState>[] = [];
    let mounts: MountFunc[] = [];
    let unmounts: MountFunc[] = [];
    if (ref) mkRef(ref, e, updates, mounts, unmounts);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE && e instanceof HTMLElement) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                setAttribute(
                    (e as HTMLElement).style,
                    styleKey,
                    styleValue as string | DynamicAttributeOrProperty<ViewState, any>,
                    updates,
                );
            });
        } else {
            setAttribute(
                e,
                key,
                value as string | DynamicAttributeOrProperty<ViewState, any>,
                updates,
            );
        }
    });
    return { e, updates, mounts, unmounts };
}

export function normalizeUpdates<ViewState>(
    updates: Array<updateFunc<ViewState>>,
): updateFunc<ViewState> {
    if (updates.length === 1) return updates[0];
    else if (updates.length > 0) {
        for (let i = updates.length - 1; i >= 0; i--) {
            if (updates[i]._origUpdates) updates.splice(i, 1, ...updates[i]._origUpdates);
        }
        let updateFunc: updateFunc<ViewState> = (newData) => {
            updates.forEach((updateFn) => updateFn(newData));
        };
        updateFunc._origUpdates = updates;
        return updateFunc;
    } else {
        return noopUpdate;
    }
}

export function normalizeMount(mounts: Array<MountFunc>): MountFunc {
    if (mounts.length === 1) return mounts[0];
    else if (mounts.length > 0) {
        return () => {
            mounts.forEach((updateFn) => updateFn());
        };
    } else {
        return noopMount;
    }
}

export interface HeadLink {
    rel: string;
    href: string;
    attributes?: Record<string, string>;
}

// Todo for jay-stack, this needs to be part of the SSR / slowly / fast rendering flows
export function injectHeadLinks(headLinks: HeadLink[]): void {
    const head = document.head;
    if (!head) return;

    headLinks.forEach((linkData) => {
        // Check if a link with the same href and rel already exists to avoid duplicates
        const existingLink = head.querySelector(
            `link[href="${linkData.href}"][rel="${linkData.rel}"]`,
        );
        if (existingLink) return;

        const link = document.createElement('link');
        link.rel = linkData.rel;
        link.href = linkData.href;

        // Set additional attributes
        if (linkData.attributes) {
            Object.entries(linkData.attributes).forEach(([key, value]) => {
                link.setAttribute(key, value);
            });
        }

        head.appendChild(link);
    });
}
