import { createHash } from 'crypto';
import { HTMLElement, NodeType } from 'node-html-parser';
import type { Contract, ContractTag, Plugin, ProjectPage } from '@jay-framework/editor-protocol';
import type { JayHeadlessImports } from '@jay-framework/compiler-jay-html';
import { ContractTagType } from '@jay-framework/compiler-jay-html';
import type { ImportIRDocument, ImportIRNode, ImportIRStyle, ImportIRBinding } from './import-ir';
import { generateNodeId, buildDomPath, getSemanticAnchors } from './id-generator';
import { resolveStyle, parseInlineStyle, parseCssToClassMap } from './style-resolver';
import type { CssClassMap } from './style-resolver';
import { extractBindingsFromElement, buildMergedContractTags } from './binding-reconstructor';
import type { ImportContractContext, HeadlessImportInfo } from './binding-reconstructor';
import { detectVariantGroups, synthesizeVariant, synthesizeRepeater } from './variant-synthesizer';
import type { PageContractPath } from './pageContractPath';
import type { ComputedStyleMap, ScenarioStyleMaps, VariantScenario } from './computed-style-types';
import { tokenizeCondition } from './condition-tokenizer';

const BLOCK_LEVEL_TAGS = new Set([
    'div',
    'section',
    'header',
    'footer',
    'nav',
    'main',
    'article',
    'aside',
    'form',
    'ul',
    'ol',
    'li',
    'table',
    'img',
    'svg',
    'video',
    'canvas',
    'select',
    'textarea',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'pre',
    'blockquote',
    'figure',
    'figcaption',
    'details',
    'summary',
]);

const INLINE_TAGS = new Set([
    'span',
    'a',
    'strong',
    'em',
    'b',
    'i',
    'br',
    'sub',
    'sup',
    'small',
    'mark',
    'abbr',
    'code',
    'kbd',
    'var',
    'samp',
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
    return element.childNodes.filter((n) => n.nodeType === NodeType.ELEMENT_NODE) as HTMLElement[];
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

function normalizeCompilerTags(tags: unknown[]): ContractTag[] {
    return (tags as any[]).map((tag) => {
        const typeVal = tag.type;
        let typeStr: string | string[];
        if (Array.isArray(typeVal)) {
            const strings = typeVal.map((t: unknown) =>
                typeof t === 'number' ? ContractTagType[t] : String(t),
            );
            typeStr = strings.length === 1 ? strings[0] : strings;
        } else if (typeof typeVal === 'number') {
            typeStr = ContractTagType[typeVal];
        } else {
            typeStr = String(typeVal);
        }
        return {
            ...tag,
            type: typeStr,
            tags: tag.tags ? normalizeCompilerTags(tag.tags) : undefined,
        } as ContractTag;
    });
}

function buildHeadlessImportInfos(
    headlessImports: JayHeadlessImports[] | undefined,
    usedComponents: ProjectPage['usedComponents'],
    pageUrl: string,
): HeadlessImportInfo[] {
    if (!headlessImports) return [];
    const result: HeadlessImportInfo[] = [];
    for (const hi of headlessImports) {
        if (!hi.key || !hi.contract?.tags) continue;
        const usedComponent = usedComponents.find((c) => c.key === hi.key);
        const pageContractPath: PageContractPath = usedComponent
            ? {
                  pageUrl,
                  pluginName: usedComponent.appName,
                  componentName: usedComponent.componentName,
              }
            : { pageUrl };
        const normalizedTags = normalizeCompilerTags(hi.contract.tags);
        result.push({ key: hi.key, tags: normalizedTags, pageContractPath });
    }
    return result;
}

interface BuildResult {
    node: ImportIRNode;
    warnings: string[];
    componentSets: ImportIRNode[];
}

function buildNodeFromElement(
    element: HTMLElement,
    body: HTMLElement,
    contractTags: ContractTag[],
    jayPageSectionId: string,
    pageContractPath: PageContractPath,
    repeaterContext: string[][],
    contractContext?: ImportContractContext,
    cssClassMap?: CssClassMap,
    computedStyleMap?: ComputedStyleMap,
    perScenarioMaps?: ScenarioStyleMaps,
    scenarios?: VariantScenario[],
): BuildResult {
    const warnings: string[] = [];
    const componentSets: ImportIRNode[] = [];
    const tag = (element.rawTagName || 'div').toLowerCase();

    const domPath = buildDomPath(element, body);
    const figmaId = element.getAttribute('data-figma-id') ?? undefined;
    const anchors = getSemanticAnchors(element);
    const nodeId = generateNodeId(domPath, anchors, figmaId);

    const styleAttr = element.getAttribute('style') || '';
    const classAttr = element.getAttribute('class') || '';
    const classNames = classAttr ? classAttr.split(/\s+/).filter(Boolean) : undefined;

    // Lookup computed styles for this element
    const elementKey = figmaId || domPath;
    const enrichedStyles = computedStyleMap?.get(elementKey);

    const { style, warnings: styleWarnings } = resolveStyle(
        styleAttr,
        classNames,
        cssClassMap,
        enrichedStyles,
    );
    warnings.push(...styleWarnings);

    const { bindings, warnings: bindingWarnings } = extractBindingsFromElement(
        element,
        contractTags,
        jayPageSectionId,
        pageContractPath,
        repeaterContext,
        contractContext,
    );
    warnings.push(...bindingWarnings);

    const name =
        element.getAttribute('data-figma-type') ||
        element.getAttribute('ref') ||
        element.getAttribute('id') ||
        tag;

    if (tag === 'svg') {
        const viewBox = element.getAttribute('viewBox');
        let svgWidth = style.width;
        let svgHeight = style.height;
        if (viewBox) {
            const parts = viewBox.split(/\s+/).map(Number);
            if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
                svgWidth = svgWidth ?? parts[2];
                svgHeight = svgHeight ?? parts[3];
            }
        }
        const widthAttr = element.getAttribute('width');
        const heightAttr = element.getAttribute('height');
        if (!svgWidth && widthAttr) svgWidth = parseFloat(widthAttr) || undefined;
        if (!svgHeight && heightAttr) svgHeight = parseFloat(heightAttr) || undefined;

        const svgStyle: ImportIRStyle = {
            ...style,
            width: svgWidth ?? 24,
            height: svgHeight ?? 24,
        };

        const rawSvg = element.outerHTML;

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'VECTOR_PLACEHOLDER',
            name: name === 'svg' ? 'svg-icon' : name,
            tagName: 'svg',
            visible: true,
            style: svgStyle,
            svgData: rawSvg,
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: [],
        };
        return { node, warnings, componentSets };
    }

    if (isImageElement(element)) {
        const src = element.getAttribute('src') ?? undefined;
        const alt = element.getAttribute('alt') ?? undefined;
        const { parsed: rawParsed } = parseInlineStyle(styleAttr);
        const objectFitRaw = rawParsed['object-fit'];
        const objectFit = (['fill', 'contain', 'cover', 'none', 'scale-down'] as const).find(
            (v) => v === objectFitRaw,
        );

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
        return { node, warnings, componentSets };
    }

    if (isTextElement(element)) {
        const characters = flattenTextContent(element);
        const hasContainer = !!(style.backgroundColor || style.padding || style.layoutMode);

        if (hasContainer) {
            const textStyle: ImportIRStyle = {};
            if (style.fontFamily) textStyle.fontFamily = style.fontFamily;
            if (style.fontSize) textStyle.fontSize = style.fontSize;
            if (style.fontWeight) textStyle.fontWeight = style.fontWeight;
            if (style.textColor) textStyle.textColor = style.textColor;
            if (style.lineHeight !== undefined) textStyle.lineHeight = style.lineHeight;
            if (style.letterSpacing !== undefined) textStyle.letterSpacing = style.letterSpacing;

            const textChildId = generateNodeId(domPath + '/text');
            const textChild: ImportIRNode = {
                id: textChildId,
                sourcePath: domPath + '/text',
                kind: 'TEXT',
                name: characters.substring(0, 20) || 'text',
                tagName: 'span',
                visible: true,
                style: textStyle,
                text: { characters },
                children: [],
            };

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
                children: [textChild],
            };
            return { node, warnings, componentSets };
        }

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
        return { node, warnings, componentSets };
    }

    // forEach (repeater) — process only first child with updated repeater context
    const forEachAttr = element.getAttribute('forEach');
    if (forEachAttr != null && forEachAttr.trim()) {
        const forEachPath = forEachAttr.trim().split('.');
        const newRepeaterContext = [...repeaterContext, forEachPath];
        const childElements = getChildElements(element);
        const firstChild = childElements.find((el) => {
            const t = (el.rawTagName || '').toLowerCase();
            return t !== 'script' && t !== 'style' && t !== 'link';
        });

        const children: ImportIRNode[] = [];
        if (firstChild) {
            const childResult = buildNodeFromElement(
                firstChild,
                body,
                contractTags,
                jayPageSectionId,
                pageContractPath,
                newRepeaterContext,
                contractContext,
                cssClassMap,
                computedStyleMap,
                perScenarioMaps,
                scenarios,
            );
            children.push(childResult.node);
            warnings.push(...childResult.warnings);
            componentSets.push(...childResult.componentSets);
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
        return { node, warnings, componentSets };
    }

    // FRAME — recurse into children, detecting variant groups
    const childElements = getChildElements(element);
    const variantGroups = detectVariantGroups(element);

    const variantElementSet = new Set<HTMLElement>();
    const firstOfGroup = new Map<HTMLElement, (typeof variantGroups)[number]>();
    for (const group of variantGroups) {
        for (const el of group.elements) {
            variantElementSet.add(el);
        }
        firstOfGroup.set(group.elements[0]!, group);
    }

    const children: ImportIRNode[] = [];

    for (const childEl of childElements) {
        const childTag = (childEl.rawTagName || '').toLowerCase();
        if (childTag === 'script' || childTag === 'style' || childTag === 'link') continue;

        if (variantElementSet.has(childEl)) {
            const group = firstOfGroup.get(childEl);
            if (!group) continue; // not first in group → already handled

            // Build variant children with per-scenario style maps.
            // Each child element has an `if` condition — find the matching
            // scenario and use its computed styles instead of the merged map.
            const buildChildNodeCb = (el: HTMLElement): ImportIRNode => {
                const condition = el.getAttribute('if')?.trim();
                const scenarioStyleMap = condition
                    ? findScenarioForCondition(condition, perScenarioMaps, scenarios)
                    : undefined;

                const result = buildNodeFromElement(
                    el,
                    body,
                    contractTags,
                    jayPageSectionId,
                    pageContractPath,
                    repeaterContext,
                    contractContext,
                    cssClassMap,
                    scenarioStyleMap ?? computedStyleMap,
                    perScenarioMaps,
                    scenarios,
                );
                warnings.push(...result.warnings);
                componentSets.push(...result.componentSets);
                return result.node;
            };

            const {
                componentSet,
                instance,
                warnings: variantWarnings,
            } = synthesizeVariant(
                group,
                body,
                contractTags,
                jayPageSectionId,
                pageContractPath,
                buildChildNodeCb,
                contractContext,
            );
            componentSets.push(componentSet);
            children.push(instance);
            warnings.push(...variantWarnings);
            continue;
        }

        const childResult = buildNodeFromElement(
            childEl,
            body,
            contractTags,
            jayPageSectionId,
            pageContractPath,
            repeaterContext,
            contractContext,
            cssClassMap,
            computedStyleMap,
            perScenarioMaps,
            scenarios,
        );
        children.push(childResult.node);
        warnings.push(...childResult.warnings);
        componentSets.push(...childResult.componentSets);
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
    return { node, warnings, componentSets };
}

/**
 * Find the best matching scenario for a given `if` condition.
 * Returns the scenario's ComputedStyleMap, or undefined if no match.
 *
 * Matching rules:
 * - Boolean truthy (e.g., `isSearching`): matches scenario `isSearching=true`
 * - Boolean negated (e.g., `!isSearching`): matches scenario `isSearching=false`
 * - Equality (e.g., `mediaType == IMAGE`): matches scenario `mediaType=IMAGE`
 */
function findScenarioForCondition(
    condition: string,
    perScenarioMaps?: ScenarioStyleMaps,
    scenarios?: VariantScenario[],
): ComputedStyleMap | undefined {
    if (!perScenarioMaps || !scenarios || perScenarioMaps.size === 0) return undefined;

    const tokens = tokenizeCondition(condition);
    if (tokens.length === 0) return undefined;

    // Use the first non-computed token to match
    const token = tokens.find((t) => !t.isComputed && t.path.length > 0);
    if (!token) return undefined;

    const tagPath = token.path.join('.');

    let targetScenarioId: string | undefined;

    if (token.operator === '==' && token.comparedValue != null) {
        // Equality: e.g. mediaType == IMAGE → scenario "mediaType=IMAGE"
        targetScenarioId = `${tagPath}=${token.comparedValue}`;
    } else if (token.operator === '!=' && token.comparedValue != null) {
        // Inequality: find any scenario for this tagPath that ISN'T the negated value
        const negatedId = `${tagPath}=${token.comparedValue}`;
        const match = scenarios.find(
            (s) => s.id !== 'default' && s.id !== negatedId && s.id.startsWith(`${tagPath}=`),
        );
        targetScenarioId = match?.id;
    } else if (!token.operator) {
        // Boolean truthy/negated: e.g. isSearching → scenario "isSearching=true"
        targetScenarioId = token.isNegated ? `${tagPath}=false` : `${tagPath}=true`;
    }

    if (targetScenarioId) {
        return perScenarioMaps.get(targetScenarioId);
    }
    return undefined;
}

export function buildImportIR(
    body: HTMLElement,
    pageUrl: string,
    pageName: string,
    options?: {
        contract?: Contract;
        headlessImports?: JayHeadlessImports[];
        usedComponents?: ProjectPage['usedComponents'];
        css?: string;
        contentHash?: string;
        computedStyleMap?: ComputedStyleMap;
        perScenarioMaps?: ScenarioStyleMaps;
        scenarios?: VariantScenario[];
    },
): ImportIRDocument {
    const warnings: string[] = [];

    const sectionId = generateNodeId(`section:${pageUrl}`);
    const pageContractPath: PageContractPath = { pageUrl };

    const contractContext: ImportContractContext = {
        tags: options?.contract?.tags ?? [],
        headlessImports: buildHeadlessImportInfos(
            options?.headlessImports,
            options?.usedComponents ?? [],
            pageUrl,
        ),
    };
    const contractTags = buildMergedContractTags(contractContext);

    let cssClassMap: CssClassMap | undefined;
    if (options?.css) {
        const { classMap, warnings: cssWarnings } = parseCssToClassMap(options.css);
        cssClassMap = classMap.size > 0 ? classMap : undefined;
        warnings.push(...cssWarnings);
    }

    const contentElement = findFirstBlockChild(body);
    let rootChildren: ImportIRNode[] = [];

    if (contentElement) {
        const {
            node,
            warnings: nodeWarnings,
            componentSets,
        } = buildNodeFromElement(
            contentElement,
            body,
            contractTags,
            sectionId,
            pageContractPath,
            [],
            contractContext,
            cssClassMap,
            options?.computedStyleMap,
            options?.perScenarioMaps,
            options?.scenarios,
        );
        rootChildren = [node, ...componentSets];
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
