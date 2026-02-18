import { createHash } from 'crypto';
import { HTMLElement, NodeType } from 'node-html-parser';
import type { Contract, ContractTag } from '@jay-framework/editor-protocol';
import type { JayHeadlessImports } from '@jay-framework/compiler-jay-html';
import type {
    ImportIRDocument,
    ImportIRNode,
    ImportIRStyle,
    ImportIRBinding,
} from './import-ir';
import { generateNodeId, buildDomPath, getSemanticAnchors } from './id-generator';
import { resolveStyle, parseInlineStyle } from './style-resolver';
import { extractBindingsFromElement } from './binding-reconstructor';
import type { PageContractPath } from './pageContractPath';

const BLOCK_LEVEL_TAGS = new Set([
    'div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside',
    'form', 'ul', 'ol', 'li', 'table', 'img', 'svg', 'video', 'canvas',
    'select', 'textarea', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre',
    'blockquote', 'figure', 'figcaption', 'details', 'summary',
]);

const INLINE_TAGS = new Set([
    'span', 'a', 'strong', 'em', 'b', 'i', 'br', 'sub', 'sup', 'small',
    'mark', 'abbr', 'code', 'kbd', 'var', 'samp',
]);

const HEADING_TAGS: Record<string, { fontSize: number; fontWeight: number }> = {
    h1: { fontSize: 32, fontWeight: 700 },
    h2: { fontSize: 24, fontWeight: 700 },
    h3: { fontSize: 20, fontWeight: 700 },
    h4: { fontSize: 16, fontWeight: 700 },
    h5: { fontSize: 14, fontWeight: 700 },
    h6: { fontSize: 12, fontWeight: 700 },
};

function getChildElements(element: HTMLElement): HTMLElement[] {
    return element.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
}

function hasBlockLevelChild(element: HTMLElement): boolean {
    const children = getChildElements(element);
    return children.some((child) => {
        const tag = (child.rawTagName || '').toLowerCase();
        return BLOCK_LEVEL_TAGS.has(tag) && !INLINE_TAGS.has(tag);
    });
}

function isImageElement(element: HTMLElement): boolean {
    return (element.rawTagName || '').toLowerCase() === 'img';
}

function hasTextContent(element: HTMLElement): boolean {
    for (const child of element.childNodes) {
        if (child.nodeType === NodeType.TEXT_NODE) {
            const raw = (child as any).rawText ?? (child as any).text ?? '';
            if (raw.trim()) return true;
        } else if (child.nodeType === NodeType.ELEMENT_NODE) {
            const el = child as HTMLElement;
            const tag = (el.rawTagName || '').toLowerCase();
            if (INLINE_TAGS.has(tag) && hasTextContent(el)) return true;
        }
    }
    return false;
}

function isTextElement(element: HTMLElement): boolean {
    if (isImageElement(element)) return false;
    const tag = (element.rawTagName || '').toLowerCase();
    if (HEADING_TAGS[tag]) return true;
    if (hasBlockLevelChild(element)) return false;
    return hasTextContent(element);
}

function flattenTextContent(element: HTMLElement): string {
    const parts: string[] = [];

    for (const child of element.childNodes) {
        if (child.nodeType === NodeType.TEXT_NODE) {
            const raw = (child as any).rawText ?? (child as any).text ?? '';
            const text = raw.trim();
            if (text) parts.push(text);
        } else if (child.nodeType === NodeType.ELEMENT_NODE) {
            const el = child as HTMLElement;
            const tag = (el.rawTagName || '').toLowerCase();
            if (tag === 'br') {
                parts.push('\n');
            } else if (INLINE_TAGS.has(tag)) {
                const nested = flattenTextContent(el);
                if (nested) parts.push(nested);
            } else {
                const nested = flattenTextContent(el);
                if (nested) parts.push(nested);
            }
        }
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function findFirstBlockChild(body: HTMLElement): HTMLElement | null {
    const children = body.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
    return children[0] ?? null;
}

function buildNodeFromElement(
    element: HTMLElement,
    body: HTMLElement,
    contractTags: ContractTag[],
    jayPageSectionId: string,
    pageContractPath: PageContractPath,
    repeaterContext: string[][],
): { node: ImportIRNode; warnings: string[] } {
    const warnings: string[] = [];
    const tag = (element.rawTagName || 'div').toLowerCase();

    const domPath = buildDomPath(element, body);
    const figmaId = element.getAttribute('data-figma-id') ?? undefined;
    const anchors = getSemanticAnchors(element);
    const nodeId = generateNodeId(domPath, anchors, figmaId);

    const styleAttr = element.getAttribute('style') || '';
    const { style, warnings: styleWarnings } = resolveStyle(styleAttr);
    warnings.push(...styleWarnings);

    const { bindings, warnings: bindingWarnings } = extractBindingsFromElement(
        element,
        contractTags,
        jayPageSectionId,
        pageContractPath,
        repeaterContext,
    );
    warnings.push(...bindingWarnings);

    const name = element.getAttribute('data-figma-type')
        || element.getAttribute('ref')
        || element.getAttribute('id')
        || tag;

    if (isImageElement(element)) {
        const src = element.getAttribute('src') ?? undefined;
        const alt = element.getAttribute('alt') ?? undefined;
        const { parsed: rawParsed } = parseInlineStyle(styleAttr);
        const objectFitRaw = rawParsed['object-fit'];
        const objectFit = (['fill', 'contain', 'cover', 'none', 'scale-down'] as const)
            .find((v) => v === objectFitRaw);

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'IMAGE',
            name,
            tagName: tag,
            visible: true,
            style,
            image: { src, alt, objectFit },
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: [],
        };
        return { node, warnings };
    }

    if (isTextElement(element)) {
        const characters = flattenTextContent(element);

        const headingDefaults = HEADING_TAGS[tag];
        if (headingDefaults) {
            if (style.fontSize === undefined) style.fontSize = headingDefaults.fontSize;
            if (style.fontWeight === undefined) style.fontWeight = headingDefaults.fontWeight;
        }

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'TEXT',
            name,
            tagName: tag,
            visible: true,
            style,
            text: { characters },
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: [],
        };
        return { node, warnings };
    }

    // FRAME — recurse into children
    const childElements = getChildElements(element);
    const children: ImportIRNode[] = [];

    for (const childEl of childElements) {
        const childTag = (childEl.rawTagName || '').toLowerCase();
        if (childTag === 'script' || childTag === 'style' || childTag === 'link') continue;

        const { node: childNode, warnings: childWarnings } = buildNodeFromElement(
            childEl,
            body,
            contractTags,
            jayPageSectionId,
            pageContractPath,
            repeaterContext,
        );
        children.push(childNode);
        warnings.push(...childWarnings);
    }

    const node: ImportIRNode = {
        id: nodeId,
        sourcePath: domPath,
        kind: 'FRAME',
        name,
        tagName: tag,
        visible: true,
        style,
        bindings: bindings.length > 0 ? bindings : undefined,
        warnings: warnings.length > 0 ? [...warnings] : undefined,
        children,
    };
    return { node, warnings };
}

export function buildImportIR(
    body: HTMLElement,
    pageUrl: string,
    pageName: string,
    options?: {
        contract?: Contract;
        headlessImports?: JayHeadlessImports[];
        css?: string;
        contentHash?: string;
    },
): ImportIRDocument {
    const warnings: string[] = [];

    const sectionId = generateNodeId(`section:${pageUrl}`);
    const contractTags: ContractTag[] = options?.contract?.tags ?? [];
    const pageContractPath: PageContractPath = { pageUrl };

    const contentElement = findFirstBlockChild(body);
    let rootChildren: ImportIRNode[] = [];

    if (contentElement) {
        const { node, warnings: nodeWarnings } = buildNodeFromElement(
            contentElement,
            body,
            contractTags,
            sectionId,
            pageContractPath,
            [],
        );
        rootChildren = [node];
        warnings.push(...nodeWarnings);
    } else {
        warnings.push('IMPORT_EMPTY_BODY: No block-level content found in <body>');
    }

    const hash =
        options?.contentHash ??
        createHash('sha256').update(body.toString()).digest('hex').slice(0, 16);

    return {
        version: 'import-ir/v0',
        pageName,
        route: pageUrl,
        source: {
            kind: 'jay-html',
            filePath: pageUrl,
            contentHash: hash,
        },
        parser: {
            baseElementName: pageName,
        },
        contracts: {
            pageContract: options?.contract,
            headlessImports: options?.headlessImports,
        },
        root: {
            id: sectionId,
            sourcePath: 'section',
            kind: 'SECTION',
            name: pageName,
            visible: true,
            children: rootChildren,
        },
        warnings,
    };
}
