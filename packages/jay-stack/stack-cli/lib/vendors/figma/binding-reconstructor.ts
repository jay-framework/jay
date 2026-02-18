import { createHash } from 'crypto';
import type { HTMLElement } from 'node-html-parser';
import { NodeType } from 'node-html-parser';
import type { ContractTag } from '@jay-framework/editor-protocol';
import type { ImportIRBinding, VariantExpressionBinding } from './import-ir';
import type { LayerBinding } from './types';
import type { PageContractPath } from './pageContractPath';
import { findContractTag, applyRepeaterContext } from './binding-analysis';

const BINDING_PATTERN = /\{([^}]+)\}/g;
const DOLLAR_BINDING_PATTERN = /\$\{([^}]+)\}/g;
const ATTR_BINDING_PATTERN = /\{([^}]+)\}/;
const ATTR_DOLLAR_PATTERN = /\$\{([^}]+)\}/;

const BINDING_ATTRS = [
    'src',
    'alt',
    'href',
    'value',
    'placeholder',
    'title',
    'aria-label',
] as const;

function isRepeaterTag(contractTag: ContractTag): boolean {
    return contractTag.type === 'subContract' && contractTag.repeated === true;
}

function getDirectTextContent(element: HTMLElement): string {
    const parts: string[] = [];
    for (const child of element.childNodes) {
        if (child.nodeType === NodeType.TEXT_NODE) {
            const text =
                (child as { rawText?: string }).rawText ?? (child as { text?: string }).text ?? '';
            parts.push(text);
        }
    }
    return parts.join('');
}

export function extractTextBindings(textContent: string): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();

    for (const pattern of [BINDING_PATTERN, DOLLAR_BINDING_PATTERN]) {
        let m: RegExpExecArray | null;
        const re = new RegExp(pattern.source, 'g');
        while ((m = re.exec(textContent)) !== null) {
            const path = m[1]!.trim();
            if (path && !seen.has(path)) {
                seen.add(path);
                paths.push(path);
            }
        }
    }
    return paths;
}

export function extractAttributeBindings(
    element: HTMLElement,
): Array<{ attribute: string; path: string }> {
    const result: Array<{ attribute: string; path: string }> = [];
    for (const attr of BINDING_ATTRS) {
        const value = element.getAttribute(attr);
        if (value == null) continue;
        const m = value.match(ATTR_BINDING_PATTERN) ?? value.match(ATTR_DOLLAR_PATTERN);
        if (m && m[1]) {
            const path = m[1].trim();
            if (path) result.push({ attribute: attr, path });
        }
    }
    return result;
}

export function resolveBindingPath(
    rawPath: string,
    contractTags: ContractTag[],
    repeaterContext: string[][],
): { tagPath: string[]; resolved: boolean } {
    let pathToResolve = rawPath;
    let tagsToSearch = contractTags;

    if (repeaterContext.length > 0) {
        pathToResolve = applyRepeaterContext(rawPath, repeaterContext);
        const repeaterPath = repeaterContext[repeaterContext.length - 1]!;
        const repeaterTag = findContractTag(contractTags, repeaterPath);
        if (repeaterTag?.tags) {
            tagsToSearch = repeaterTag.tags;
        }
    }

    const segments = pathToResolve
        .split('.')
        .map((s) => s.trim())
        .filter(Boolean);
    if (segments.length === 0) {
        return { tagPath: [], resolved: false };
    }

    const found = findContractTag(tagsToSearch, segments);
    if (found) {
        const fullPath =
            repeaterContext.length > 0
                ? [...(repeaterContext[repeaterContext.length - 1] ?? []), ...segments]
                : segments;
        return { tagPath: fullPath, resolved: true };
    }
    return { tagPath: segments, resolved: false };
}

function createLayerBinding(
    tagPath: string[],
    jayPageSectionId: string,
    pageContractPath: PageContractPath,
    attribute?: string,
    property?: string,
): LayerBinding {
    return {
        pageContractPath,
        jayPageSectionId,
        tagPath,
        ...(attribute != null && { attribute }),
        ...(property != null && { property }),
    };
}

function variantBindingId(expression: string): string {
    return 've-' + createHash('sha256').update(expression).digest('hex').slice(0, 12);
}

export function extractBindingsFromElement(
    element: HTMLElement,
    contractTags: ContractTag[],
    jayPageSectionId: string,
    pageContractPath: PageContractPath,
    repeaterContext?: string[][],
): { bindings: ImportIRBinding[]; warnings: string[] } {
    const bindings: ImportIRBinding[] = [];
    const warnings: string[] = [];
    const ctx = repeaterContext ?? [];

    const ref = element.getAttribute('ref');
    if (ref != null && ref.trim()) {
        const name = ref.trim();
        const tag = findContractTag(contractTags, [name]);
        if (tag) {
            const binding = createLayerBinding([name], jayPageSectionId, pageContractPath);
            bindings.push({ kind: 'layer', binding });
        } else {
            warnings.push(`BINDING_UNRESOLVED: Could not resolve '${name}' against contract`);
        }
    }

    const directText = getDirectTextContent(element);
    const textPaths = extractTextBindings(directText);
    for (const path of textPaths) {
        const { tagPath, resolved } = resolveBindingPath(path, contractTags, ctx);
        if (resolved) {
            bindings.push({
                kind: 'layer',
                binding: createLayerBinding(tagPath, jayPageSectionId, pageContractPath),
            });
        } else {
            warnings.push(`BINDING_UNRESOLVED: Could not resolve '{${path}}' against contract`);
        }
    }

    const attrBindings = extractAttributeBindings(element);
    for (const { attribute, path } of attrBindings) {
        const { tagPath, resolved } = resolveBindingPath(path, contractTags, ctx);
        if (resolved) {
            bindings.push({
                kind: 'layer',
                binding: createLayerBinding(tagPath, jayPageSectionId, pageContractPath, attribute),
            });
        } else {
            warnings.push(`BINDING_UNRESOLVED: Could not resolve '{${path}}' against contract`);
        }
    }

    const ifExpr = element.getAttribute('if');
    if (ifExpr != null && ifExpr.trim()) {
        const expression = ifExpr.trim();
        const variantBinding: VariantExpressionBinding = {
            id: variantBindingId(expression),
            expression,
            references: [],
            kind: 'variant-expression',
        };
        bindings.push({ kind: 'variant', binding: variantBinding });
    }

    const forEachPath = element.getAttribute('forEach');
    if (forEachPath != null && forEachPath.trim()) {
        const path = forEachPath.trim();
        const { tagPath, resolved } = resolveBindingPath(path, contractTags, ctx);
        if (resolved) {
            const repeaterTag = findContractTag(contractTags, tagPath);
            if (repeaterTag && isRepeaterTag(repeaterTag)) {
                bindings.push({
                    kind: 'layer',
                    binding: createLayerBinding(tagPath, jayPageSectionId, pageContractPath),
                });
            } else {
                warnings.push(
                    `BINDING_UNRESOLVED: Could not resolve forEach '${path}' as repeater`,
                );
            }
        } else {
            warnings.push(`BINDING_UNRESOLVED: Could not resolve '${path}' against contract`);
        }
    }

    return { bindings, warnings };
}
