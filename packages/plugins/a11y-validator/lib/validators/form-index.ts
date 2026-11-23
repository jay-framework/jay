import { allElements, hasAncestor, staticAttribute, tagOf } from '../dom.js';
import { tokensOf } from './autocomplete.js';

/** One pass over the page body: document order, static ids and label texts (DL#240). */
export interface FormIndex {
    elements: any[];
    position: Map<any, number>;
    staticIds: Set<string>;
    elementById: Map<string, any>;
    labelTextByFor: Map<string, string>;
    errorMessageIds: Set<string>;
}

export function makeFormIndex(body: any): FormIndex {
    const elements = allElements(body);
    const index: FormIndex = {
        elements,
        position: new Map(elements.map((el, i) => [el, i])),
        staticIds: new Set(),
        elementById: new Map(),
        labelTextByFor: new Map(),
        errorMessageIds: new Set(),
    };
    for (const el of elements) {
        const id = staticAttribute(el, 'id');
        if (id) {
            index.staticIds.add(id);
            if (!index.elementById.has(id)) index.elementById.set(id, el);
        }
        const forId = tagOf(el) === 'label' ? staticAttribute(el, 'for') : undefined;
        if (forId) index.labelTextByFor.set(forId, textOf(el));
        for (const token of tokensOf(staticAttribute(el, 'aria-errormessage') ?? '')) {
            index.errorMessageIds.add(token);
        }
    }
    return index;
}

function textOf(el: any): string {
    return (el.text ?? '').replace(/\s+/g, ' ').trim();
}

/** Visible label text: `<label for>`, a wrapping `<label>`, or `aria-label`. */
export function labelTextOf(el: any, index: FormIndex): string | undefined {
    const id = staticAttribute(el, 'id');
    if (id && index.labelTextByFor.has(id)) return index.labelTextByFor.get(id) || undefined;
    let wrapping: any;
    hasAncestor(el, (a) => (tagOf(a) === 'label' ? ((wrapping = a), true) : false));
    if (wrapping) return textOf(wrapping) || undefined;
    return staticAttribute(el, 'aria-label')?.trim() || undefined;
}

export function hasAccessibleName(el: any, index: FormIndex): boolean {
    if ((el.getAttribute?.('aria-label') ?? '').trim()) return true;
    if ((el.getAttribute?.('aria-labelledby') ?? '').trim()) return true;
    const id = staticAttribute(el, 'id');
    if (id && index.labelTextByFor.has(id)) return true;
    return hasAncestor(el, (a) => tagOf(a) === 'label');
}

const ORDINAL_SUFFIX = (n: number) => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

function ordinalOf(el: any, index: FormIndex): number {
    const tag = tagOf(el);
    return index.elements.slice(0, index.position.get(el)! + 1).filter((e) => tagOf(e) === tag)
        .length;
}

/**
 * The located element of DL#240 §4: name, else id, else label text, else placeholder (unless the
 * message already quotes it), else the ordinal among elements of the same tag. `type` is always shown.
 */
export function describeElement(el: any, index: FormIndex, { usePlaceholder = true } = {}): string {
    const tag = tagOf(el);
    const type = staticAttribute(el, 'type');
    const typePart = type !== undefined ? ` type="${type}"` : '';
    const name = staticAttribute(el, 'name');
    if (name) return `<${tag}${typePart} name="${name}">`;
    const id = staticAttribute(el, 'id');
    if (id) return `<${tag}${typePart} id="${id}">`;
    const label = labelTextOf(el, index);
    if (label) return `<${tag}${typePart}> labelled "${label}"`;
    const placeholder = staticAttribute(el, 'placeholder');
    if (usePlaceholder && placeholder)
        return `<${tag}${typePart}> with placeholder "${placeholder}"`;
    return `<${tag}${typePart}> (${ORDINAL_SUFFIX(ordinalOf(el, index))} ${tag} in the file)`;
}
