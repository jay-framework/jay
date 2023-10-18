import { Kindergarten, KindergartenGroup } from './kindergarden';
import { ITEM_ADDED, ITEM_REMOVED, listCompare, MatchResult } from 'jay-list-compare';
import { RandomAccessLinkedList as List } from 'jay-list-compare';
import {
    BaseJayElement,
    JayComponent,
    JayComponentConstructor,
    MountFunc,
    noopMount,
    noopUpdate,
    updateFunc,
} from './element-types';
import './element-test-types';
import {
    CONSTRUCTION_CONTEXT_MARKER,
    currentConstructionContext,
    provideContext,
    restoreContext,
    saveContext,
    wrapWithModifiedCheck,
} from './context';
import { PrivateRef } from './node-reference';

const STYLE = 'style';

function mkRef<ViewState>(
    ref: PrivateRef<ViewState, any>,
    referenced: HTMLElement | JayComponent<any, ViewState, any>,
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
    target: HTMLElement | CSSStyleDeclaration,
    key: string,
    value: S,
    attributeStyle: AttributeStyle,
) {
    const isHTMLElement = target instanceof HTMLElement;
    if (isHTMLElement && attributeStyle === ATTRIBUTE) {
        target.setAttribute(key, value as unknown as string);
    }
    if (isHTMLElement && attributeStyle === BOOLEAN_ATTRIBUTE) {
        if (value) target.setAttribute(key, value as unknown as string);
        else target.removeAttribute(key);
    } else target[key] = value;
}

function setAttribute<ViewState, S>(
    target: HTMLElement | CSSStyleDeclaration,
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
    elem: BaseJayElement<ViewState> | TextElement<ViewState> | string,
): Conditional<ViewState> {
    if (typeof elem === 'string') return { condition, elem: text(elem) };
    else return { condition, elem };
}

export interface Conditional<ViewState> {
    condition: (newData: ViewState) => boolean;
    elem: BaseJayElement<ViewState> | TextElement<ViewState>;
}

function isJayElement<ViewState>(
    c:
        | Conditional<ViewState>
        | ForEach<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is BaseJayElement<ViewState> {
    return (c as BaseJayElement<ViewState>).mount !== undefined;
}
export function isCondition<ViewState>(
    c:
        | Conditional<ViewState>
        | ForEach<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is Conditional<ViewState> {
    return (c as Conditional<ViewState>).condition !== undefined;
}

export function isForEach<ViewState, Item>(
    c:
        | Conditional<ViewState>
        | ForEach<ViewState, Item>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>,
): c is ForEach<ViewState, Item> {
    return (c as ForEach<ViewState, Item>).elemCreator !== undefined;
}

export function forEach<T, Item>(
    getItems: (T) => Array<Item>,
    elemCreator: (Item) => BaseJayElement<Item>,
    matchBy: string,
): ForEach<T, Item> {
    return { getItems, elemCreator, matchBy };
}

export interface ForEach<ViewState, Item> {
    getItems: (T) => Array<Item>;
    elemCreator: (Item, String) => BaseJayElement<Item>;
    matchBy: string;
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
    let lastItemsList = new List<Item, BaseJayElement<Item>>([], child.matchBy);
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
            let itemsList = new List<Item, BaseJayElement<Item>>(items, child.matchBy);
            let instructions = listCompare<Item, BaseJayElement<Item>>(
                lastItemsList,
                itemsList,
                (item, id) => {
                    let childContext = parentContext.forItem(item);
                    return restoreContext(savedContext, () =>
                        provideContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () =>
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
    if (isJayElement(child.elem) && child.elem.mount !== noopMount) {
        mount = () => (child.elem as BaseJayElement<ViewState>).mount();
        unmount = () => (child.elem as BaseJayElement<ViewState>).unmount();
    }
    let lastResult = false;
    const update = (newData: ViewState) => {
        let result = child.condition(newData);

        if (result) {
            if (!lastResult) {
                group.ensureNode(child.elem.dom);
                child.elem.mount();
            }
            child.elem.update(newData);
        } else if (lastResult) {
            group.removeNode(child.elem.dom);
            child.elem.unmount();
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

export function element<ViewState>(
    tagName: string,
    attributes: Attributes<ViewState>,
    children: Array<BaseJayElement<ViewState> | TextElement<ViewState> | string> = [],
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState> {
    let { e, updates, mounts, unmounts } = createBaseElement(tagName, attributes, ref);

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
}

export function dynamicElement<ViewState>(
    tagName: string,
    attributes: Attributes<ViewState>,
    children: Array<
        | Conditional<ViewState>
        | ForEach<ViewState, any>
        | TextElement<ViewState>
        | BaseJayElement<ViewState>
        | string
    > = [],
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState> {
    let { e, updates, mounts, unmounts } = createBaseElement(tagName, attributes, ref);

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
}

function createBaseElement<ViewState>(
    tagName: string,
    attributes: Attributes<ViewState>,
    ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): {
    e: HTMLElement;
    updates: updateFunc<ViewState>[];
    mounts: MountFunc[];
    unmounts: MountFunc[];
} {
    let e = document.createElement(tagName);
    let updates: updateFunc<ViewState>[] = [];
    let mounts: MountFunc[] = [];
    let unmounts: MountFunc[] = [];
    if (ref) mkRef(ref, e, updates, mounts, unmounts);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === STYLE) {
            Object.entries(value).forEach(([styleKey, styleValue]) => {
                setAttribute(
                    e.style,
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
            updates.forEach((__update) => __update(newData));
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
            mounts.forEach((__update) => __update());
        };
    } else {
        return noopMount;
    }
}
