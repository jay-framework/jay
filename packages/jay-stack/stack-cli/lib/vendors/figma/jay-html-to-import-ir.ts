import { createHash } from 'crypto';
import { HTMLElement, NodeType } from 'node-html-parser';
import type { Contract } from '@jay-framework/editor-protocol';
import type { JayHeadlessImports } from '@jay-framework/compiler-jay-html';
import type {
    ImportIRDocument,
    ImportIRNode,
    ImportIRStyle,
    ImportIRLayoutMode,
} from './import-ir';
import { generateNodeId, buildDomPath, getSemanticAnchors } from './id-generator';

function parseInlineStyle(styleAttr: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!styleAttr) return result;

    for (const declaration of styleAttr.split(';')) {
        const trimmed = declaration.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;

        const prop = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        if (prop && value) {
            result[prop] = value;
        }
    }
    return result;
}

function parsePxValue(value: string): number | undefined {
    if (!value) return undefined;
    const match = value.match(/^([\d.]+)px$/);
    return match ? parseFloat(match[1]) : undefined;
}

function resolveInlineStyle(styleAttr: string): { style: ImportIRStyle; warnings: string[] } {
    const warnings: string[] = [];
    const style: ImportIRStyle = {};
    const parsed = parseInlineStyle(styleAttr);

    for (const [prop, value] of Object.entries(parsed)) {
        if (value.includes('{') && value.includes('}')) {
            warnings.push(`CSS_DYNAMIC_VALUE: Skipping dynamic value in '${prop}'`);
            continue;
        }

        switch (prop) {
            case 'width': {
                const px = parsePxValue(value);
                if (px !== undefined) style.width = px;
                else warnings.push(`CSS_UNSUPPORTED_UNIT: '${prop}: ${value}'`);
                break;
            }
            case 'height': {
                const px = parsePxValue(value);
                if (px !== undefined) style.height = px;
                else warnings.push(`CSS_UNSUPPORTED_UNIT: '${prop}: ${value}'`);
                break;
            }
            case 'display':
                if (value === 'flex') {
                    // layoutMode will be set by flex-direction (default 'row')
                    if (!style.layoutMode) style.layoutMode = 'row';
                }
                break;
            case 'flex-direction':
                if (value === 'column') style.layoutMode = 'column';
                else if (value === 'row') style.layoutMode = 'row';
                break;
            case 'gap': {
                const px = parsePxValue(value);
                if (px !== undefined) style.gap = px;
                break;
            }
            case 'padding': {
                const parts = value.split(/\s+/).map(parsePxValue);
                if (parts.length === 1 && parts[0] !== undefined) {
                    style.padding = {
                        top: parts[0],
                        right: parts[0],
                        bottom: parts[0],
                        left: parts[0],
                    };
                } else if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
                    style.padding = {
                        top: parts[0],
                        right: parts[1],
                        bottom: parts[0],
                        left: parts[1],
                    };
                } else if (parts.length === 4 && parts.every((p) => p !== undefined)) {
                    style.padding = {
                        top: parts[0]!,
                        right: parts[1]!,
                        bottom: parts[2]!,
                        left: parts[3]!,
                    };
                }
                break;
            }
            case 'padding-top': {
                const px = parsePxValue(value);
                if (px !== undefined) {
                    style.padding = {
                        ...{ top: 0, right: 0, bottom: 0, left: 0 },
                        ...style.padding,
                        top: px,
                    };
                }
                break;
            }
            case 'padding-right': {
                const px = parsePxValue(value);
                if (px !== undefined) {
                    style.padding = {
                        ...{ top: 0, right: 0, bottom: 0, left: 0 },
                        ...style.padding,
                        right: px,
                    };
                }
                break;
            }
            case 'padding-bottom': {
                const px = parsePxValue(value);
                if (px !== undefined) {
                    style.padding = {
                        ...{ top: 0, right: 0, bottom: 0, left: 0 },
                        ...style.padding,
                        bottom: px,
                    };
                }
                break;
            }
            case 'padding-left': {
                const px = parsePxValue(value);
                if (px !== undefined) {
                    style.padding = {
                        ...{ top: 0, right: 0, bottom: 0, left: 0 },
                        ...style.padding,
                        left: px,
                    };
                }
                break;
            }
            case 'background-color':
                style.backgroundColor = value;
                break;
            case 'color':
                style.textColor = value;
                break;
            case 'font-family':
                style.fontFamily = value
                    .split(',')[0]
                    .trim()
                    .replace(/^['"]|['"]$/g, '');
                break;
            case 'font-size': {
                const px = parsePxValue(value);
                if (px !== undefined) style.fontSize = px;
                break;
            }
            case 'font-weight': {
                const num = parseInt(value, 10);
                if (!isNaN(num)) style.fontWeight = num;
                else if (value === 'bold') style.fontWeight = 700;
                else if (value === 'normal') style.fontWeight = 400;
                break;
            }
            case 'line-height': {
                const px = parsePxValue(value);
                if (px !== undefined) style.lineHeight = px;
                break;
            }
            case 'letter-spacing': {
                const px = parsePxValue(value);
                if (px !== undefined) style.letterSpacing = px;
                break;
            }
            case 'border-radius': {
                const px = parsePxValue(value);
                if (px !== undefined) style.borderRadius = px;
                break;
            }
            case 'opacity': {
                const num = parseFloat(value);
                if (!isNaN(num)) style.opacity = num;
                break;
            }
            case 'border': {
                const parts = value.split(/\s+/);
                if (parts.length >= 1) {
                    const widthPx = parsePxValue(parts[0]);
                    if (widthPx !== undefined) style.borderWidth = widthPx;
                }
                if (parts.length >= 3) {
                    style.borderColor = parts[2];
                }
                break;
            }
            case 'justify-content': {
                const map: Record<string, ImportIRStyle['justifyContent']> = {
                    'flex-start': 'MIN',
                    center: 'CENTER',
                    'flex-end': 'MAX',
                    'space-between': 'SPACE_BETWEEN',
                };
                if (map[value]) style.justifyContent = map[value];
                break;
            }
            case 'align-items': {
                const map: Record<string, ImportIRStyle['alignItems']> = {
                    'flex-start': 'MIN',
                    center: 'CENTER',
                    'flex-end': 'MAX',
                    stretch: 'STRETCH',
                };
                if (map[value]) style.alignItems = map[value];
                break;
            }
            // Properties recognized but not stored (handled by adapter or later phases)
            case 'box-sizing':
            case 'overflow':
            case 'position':
            case 'top':
            case 'left':
            case 'object-fit':
            case 'text-align':
                break;
            default:
                break;
        }
    }

    return { style, warnings };
}

function findFirstBlockChild(body: HTMLElement): HTMLElement | null {
    const children = body.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
    return children[0] ?? null;
}

/**
 * Build an Import IR document from a parsed Jay-HTML body.
 * Phase 0: Creates SECTION > FRAME skeleton with basic inline style parsing.
 */
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

    const contentElement = findFirstBlockChild(body);
    let rootChildren: ImportIRNode[] = [];

    if (contentElement) {
        const domPath = buildDomPath(contentElement, body);
        const figmaId = contentElement.getAttribute('data-figma-id') ?? undefined;
        const anchors = getSemanticAnchors(contentElement);
        const frameId = generateNodeId(domPath, anchors, figmaId);

        const styleAttr = contentElement.getAttribute('style') || '';
        const { style, warnings: styleWarnings } = resolveInlineStyle(styleAttr);
        warnings.push(...styleWarnings);

        const frameNode: ImportIRNode = {
            id: frameId,
            sourcePath: domPath,
            kind: 'FRAME',
            name: contentElement.getAttribute('data-figma-type') || 'content',
            tagName: contentElement.rawTagName || 'div',
            visible: true,
            style,
            children: [],
        };

        rootChildren = [frameNode];
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
