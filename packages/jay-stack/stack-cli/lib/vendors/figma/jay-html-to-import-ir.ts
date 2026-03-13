import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { HTMLElement, NodeType } from 'node-html-parser';
import type { Contract, ContractTag, Plugin, ProjectPage } from '@jay-framework/editor-protocol';
import type { JayHeadlessImports } from '@jay-framework/compiler-jay-html';
import { ContractTagType, computeSourceId, parseContract } from '@jay-framework/compiler-jay-html';
import type { ImportIRDocument, ImportIRNode, ImportIRStyle } from './import-ir';
import { generateNodeId, buildDomPath, getSemanticAnchors } from './id-generator';
import { resolveStyle, parseInlineStyle, parseCssToClassMap, resolveClassStyles } from './style-resolver';
import type { CssClassMap } from './style-resolver';
import { extractStaticClassOnlySafeProps } from './class-style-baseline';
import { extractBindingsFromElement, buildMergedContractTags } from './binding-reconstructor';
import type { ImportContractContext, HeadlessImportInfo } from './binding-reconstructor';
import { detectVariantGroups, synthesizeVariant, synthesizeRepeater } from './variant-synthesizer';
import type { PageContractPath } from './pageContractPath';
import type {
    ComputedStyleMap,
    ComputedStyleData,
    RepeaterDataMap,
    ScenarioStyleMaps,
    VariantScenario,
} from './computed-style-types';
import { tokenizeCondition } from './condition-tokenizer';

export interface EnrichmentResult {
    data: ComputedStyleData | undefined;
    confidence: 'high' | 'low' | 'none';
    ambiguityWarning?: string;
}

function selectBestEnrichmentCandidate(
    element: HTMLElement,
    sourceId: string,
    computedStyleMap: ComputedStyleMap | undefined,
    repeaterDataMap: RepeaterDataMap | undefined,
): EnrichmentResult {
    if (!computedStyleMap && !repeaterDataMap) {
        return { data: undefined, confidence: 'none' };
    }

    const candidates = repeaterDataMap?.get(sourceId) ?? [];
    const singleFromMap = computedStyleMap?.get(sourceId);

    if (candidates.length === 0 && !singleFromMap) {
        return { data: undefined, confidence: 'none' };
    }

    if (candidates.length <= 1 && singleFromMap) {
        return { data: singleFromMap, confidence: 'high' };
    }

    if (candidates.length === 0) {
        return { data: singleFromMap, confidence: 'high' };
    }

    const sourceTag = (element.rawTagName || 'div').toLowerCase();
    const sourceClassTokens = (element.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
    const sourceText = flattenTextContent(element).slice(0, 80);

    const scored = candidates.map((c, idx) => {
        let score = 0;
        const id = c.candidateIdentity;
        if (id?.tagName === sourceTag) score += 10;
        if (id?.classNameTokens && sourceClassTokens) {
            const srcSet = new Set(sourceClassTokens.split(/\s+/));
            const candSet = new Set(id.classNameTokens.split(/\s+/));
            const overlap = [...srcSet].filter((t) => candSet.has(t)).length;
            if (overlap === srcSet.size && overlap === candSet.size) score += 5;
            else if (overlap > 0) score += 2;
        } else if (!id?.classNameTokens && !sourceClassTokens) score += 3;
        if (id?.textSignal && sourceText) {
            const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
            if (norm(id.textSignal) === norm(sourceText)) score += 8;
            else if (
                norm(id.textSignal).includes(norm(sourceText)) ||
                norm(sourceText).includes(norm(id.textSignal))
            )
                score += 2;
        }
        return { candidate: c, score, idx };
    });

    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const best = scored[0];
    const next = scored[1];

    if (!best || best.score === 0) {
        return {
            data: singleFromMap ?? candidates[0],
            confidence: 'low',
            ambiguityWarning: `sid=${sourceId}: no confident match among ${candidates.length} candidates`,
        };
    }

    if (next && next.score === best.score) {
        return {
            data: singleFromMap ?? best.candidate,
            confidence: 'low',
            ambiguityWarning: `sid=${sourceId}: tie between ${candidates.length} candidates (score=${best.score})`,
        };
    }

    return { data: best.candidate, confidence: 'high' };
}

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
    'input',
    'button',
    'label',
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

function collectSelectOptions(
    selectElement: HTMLElement,
): Array<{ value: string; text: string; selected?: boolean }> {
    const options: Array<{ value: string; text: string; selected?: boolean }> = [];
    const optionElements = selectElement.querySelectorAll('option');
    for (const opt of optionElements) {
        const value = opt.getAttribute('value') ?? '';
        const text = opt.textContent?.trim() ?? '';
        const selected = opt.hasAttribute('selected') || undefined;
        options.push({ value, text, selected });
    }
    return options;
}

function isStructuralElement(child: HTMLElement): boolean {
    if (child.getAttribute('class')) return true;
    if (child.getAttribute('if')) return true;
    if (child.getAttribute('ref')) return true;
    if (child.getAttribute('forEach')) return true;
    const childElements = child.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
    if (childElements.some((el) => isStructuralElement(el))) return true;
    return false;
}

function hasBlockLevelChild(element: HTMLElement): boolean {
    const children = getChildElements(element);
    return children.some((child) => {
        const tag = (child.rawTagName || '').toLowerCase();
        if (BLOCK_LEVEL_TAGS.has(tag) && !INLINE_TAGS.has(tag)) return true;
        if (INLINE_TAGS.has(tag) && isStructuralElement(child)) return true;
        return false;
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
    if (hasBlockLevelChild(element)) return false;
    // When child inline elements carry bindings, refs, or binding-bearing
    // attributes, treat the parent as a FRAME so each child becomes a
    // separate Figma node with its own editable bindings. Flattening to
    // a single TEXT would lose the nested structure and prevent designers
    // from editing bindings on child elements via the plugin.
    if (hasBindingBearingChildren(element)) return false;
    if (HEADING_TAGS[tag]) return true;
    return hasTextContent(element);
}

/**
 * Returns true when an element has descendant inline elements that carry
 * bindings, refs, or binding-bearing attributes (e.g. href="{...}").
 * Such children must remain as separate Figma nodes to preserve
 * designer-editable binding metadata across roundtrips.
 */
function hasBindingBearingChildren(element: HTMLElement): boolean {
    for (const child of element.childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const el = child as HTMLElement;
        const tag = (el.rawTagName || '').toLowerCase();
        if (!INLINE_TAGS.has(tag)) continue;
        if (el.getAttribute('ref')) return true;
        if (el.getAttribute('forEach')) return true;
        if (el.getAttribute('if')) return true;
        for (const attr of ['href', 'src', 'value'] as const) {
            const val = el.getAttribute(attr);
            if (val && /\{[^}]+\}/.test(val)) return true;
        }
        if (hasBindingBearingChildren(el)) return true;
    }
    return false;
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

/**
 * Detect and inline-replace `<div style="display: contents;">` wrappers.
 * These wrappers are emitted by the export pipeline for conditionals but add
 * no semantic or visual meaning. Flattening them before IR building keeps the
 * tree shape stable across roundtrips and avoids wrapper inflation.
 */
function flattenDisplayContentsWrappers(element: HTMLElement): void {
    const origChildren = [...element.childNodes];
    let needsRewrite = false;
    for (const child of origChildren) {
        if (
            child.nodeType === NodeType.ELEMENT_NODE &&
            isDisplayContentsWrapper(child as HTMLElement)
        ) {
            needsRewrite = true;
            break;
        }
    }
    if (!needsRewrite) return;

    const newChildren: typeof origChildren = [];
    for (const child of origChildren) {
        if (
            child.nodeType === NodeType.ELEMENT_NODE &&
            isDisplayContentsWrapper(child as HTMLElement)
        ) {
            for (const grandchild of (child as HTMLElement).childNodes) {
                newChildren.push(grandchild);
            }
        } else {
            newChildren.push(child);
        }
    }

    // Replace children in-place, preserving order
    (element as any).set_content('');
    for (const child of newChildren) {
        element.appendChild(child);
    }
}

function isDisplayContentsWrapper(el: HTMLElement): boolean {
    const tag = (el.rawTagName || '').toLowerCase();
    if (tag !== 'div') return false;
    if (el.getAttribute('class')) return false;
    if (el.getAttribute('ref')) return false;
    if (el.getAttribute('id')) return false;
    if (el.getAttribute('forEach')) return false;
    if (el.getAttribute('if')) return false;
    const style = el.getAttribute('style') || '';
    return /display\s*:\s*contents/i.test(style);
}

function findFirstBlockChild(body: HTMLElement): HTMLElement | null {
    const children = body.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
    return children[0] ?? null;
}

export function normalizeCompilerTags(tags: unknown[]): ContractTag[] {
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

/**
 * Recursively resolve `link` directives in contract tags by loading the
 * linked contract files and inlining their tags.
 * Needed because the compiler stores links as references without inlining
 * the linked contract's tags into the parent.
 */
export function resolveContractTagLinks(tags: unknown[], contractDir: string): unknown[] {
    return (tags as any[]).map((rawTag) => {
        const tag = { ...rawTag };
        if (tag.link && (!tag.tags || tag.tags.length === 0)) {
            const linkPath = tag.link.endsWith('.jay-contract')
                ? tag.link
                : tag.link + '.jay-contract';
            try {
                const absolutePath = path.resolve(contractDir, linkPath);
                const yamlContent = readFileSync(absolutePath, 'utf-8');
                const parsed = parseContract(yamlContent, path.basename(absolutePath));
                if (parsed.val?.tags) {
                    tag.tags = resolveContractTagLinks(parsed.val.tags, path.dirname(absolutePath));
                }
            } catch {
                // Linked contract not found or parse error — leave as-is
            }
        } else if (tag.tags && tag.tags.length > 0) {
            tag.tags = resolveContractTagLinks(tag.tags, contractDir);
        }
        return tag;
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
        const contractDir = hi.contractPath ? path.dirname(hi.contractPath) : undefined;
        const resolvedTags = contractDir
            ? resolveContractTagLinks(hi.contract.tags as unknown[], contractDir)
            : (hi.contract.tags as unknown[]);
        const normalizedTags = normalizeCompilerTags(resolvedTags);
        result.push({ key: hi.key, tags: normalizedTags, pageContractPath });
    }
    return result;
}

interface BuildResult {
    node: ImportIRNode;
    warnings: string[];
    componentSets: ImportIRNode[];
}

type HTMLElementWithRange = HTMLElement & { range: [number, number] };

function hasRange(element: HTMLElement): element is HTMLElementWithRange {
    const r = (element as any).range;
    return Array.isArray(r) && r.length >= 2 && typeof r[0] === 'number' && r[0] >= 0;
}

function elementSourceId(element: HTMLElement, sourceHtml?: string): string | undefined {
    if (!sourceHtml || !hasRange(element)) return undefined;
    return computeSourceId(element.range[0], sourceHtml);
}

interface BuildNodeContext {
    body: HTMLElement;
    contractTags: ContractTag[];
    jayPageSectionId: string;
    pageContractPath: PageContractPath;
    repeaterContext: string[][];
    contractContext?: ImportContractContext;
    cssClassMap?: CssClassMap;
    computedStyleMap?: ComputedStyleMap;
    repeaterDataMap?: RepeaterDataMap;
    perScenarioMaps?: ScenarioStyleMaps;
    scenarios?: VariantScenario[];
    sourceHtml?: string;
    /** When false, skip repeater-based candidate disambiguation (variant scenario). */
    isDefaultScenario?: boolean;
}

const MAX_DEMO_ITEMS = 4;

type DemoItem = {
    textOverrides: Record<string, string>;
    imageOverrides: Record<string, string>;
};

function collectTemplateLeafNodes(
    node: ImportIRNode,
): Array<{ id: string; kind: 'TEXT' | 'IMAGE'; text?: string; imageSrc?: string }> {
    const leaves: Array<{
        id: string;
        kind: 'TEXT' | 'IMAGE';
        text?: string;
        imageSrc?: string;
    }> = [];

    function walk(n: ImportIRNode) {
        if (n.kind === 'TEXT' && n.text) {
            leaves.push({ id: n.id, kind: 'TEXT', text: n.text.characters });
        } else if (n.kind === 'IMAGE') {
            leaves.push({
                id: n.id,
                kind: 'IMAGE',
                imageSrc: n.image?.resolvedSrc || n.image?.src,
            });
        }
        if (n.children) {
            for (const child of n.children) walk(child);
        }
    }

    walk(node);
    return leaves;
}

function extractDemoItems(
    templateNode: ImportIRNode,
    repeaterDataMap: RepeaterDataMap | undefined,
): DemoItem[] {
    if (!repeaterDataMap || repeaterDataMap.size === 0) return [];

    const leaves = collectTemplateLeafNodes(templateNode);
    if (leaves.length === 0) return [];

    // Find how many additional rendered instances exist by looking at the
    // first leaf's sid in the repeaterDataMap (all repeater children have the same count).
    const firstLeafInstances = repeaterDataMap.get(leaves[0].id);
    if (!firstLeafInstances || firstLeafInstances.length <= 1) return [];

    const instanceCount = Math.min(firstLeafInstances.length - 1, MAX_DEMO_ITEMS);
    const demoItems: DemoItem[] = [];

    for (let i = 0; i < instanceCount; i++) {
        const textOverrides: Record<string, string> = {};
        const imageOverrides: Record<string, string> = {};

        for (const leaf of leaves) {
            const instances = repeaterDataMap.get(leaf.id);
            if (!instances || instances.length <= i + 1) continue;

            const demoData = instances[i + 1]; // index 0 is the template

            if (leaf.kind === 'TEXT') {
                const demoText = demoData.textContent;
                if (demoText && demoText !== leaf.text) {
                    textOverrides[leaf.id] = demoText;
                }
            } else if (leaf.kind === 'IMAGE') {
                const demoSrc = demoData.image?.renderedSrc;
                if (demoSrc && demoSrc !== leaf.imageSrc) {
                    imageOverrides[leaf.id] = demoSrc;
                }
            }
        }

        if (Object.keys(textOverrides).length > 0 || Object.keys(imageOverrides).length > 0) {
            demoItems.push({ textOverrides, imageOverrides });
        }
    }

    return demoItems;
}

function buildNodeFromElement(element: HTMLElement, ctx: BuildNodeContext): BuildResult | null {
    const {
        body,
        contractTags,
        jayPageSectionId,
        pageContractPath,
        repeaterContext,
        contractContext,
        cssClassMap,
        computedStyleMap,
        repeaterDataMap,
        perScenarioMaps,
        scenarios,
        sourceHtml,
    } = ctx;
    const warnings: string[] = [];
    const componentSets: ImportIRNode[] = [];
    const tag = (element.rawTagName || 'div').toLowerCase();

    const sourceId = elementSourceId(element, sourceHtml);
    const domPath = buildDomPath(element, body);
    const anchors = getSemanticAnchors(element);
    const nodeId = sourceId || generateNodeId(domPath, anchors);

    const styleAttr = element.getAttribute('style') || '';
    const classAttr = element.getAttribute('class') || '';
    const classNames = classAttr ? classAttr.split(/\s+/).filter(Boolean) : undefined;
    const className = classAttr || undefined;

    const HTML_ATTRS_TO_CAPTURE = [
        'href',
        'src',
        'alt',
        'value',
        'placeholder',
        'title',
        'disabled',
        'type',
        'loading',
        'target',
        'rel',
        'name',
        'min',
        'max',
        'step',
        'checked',
        'required',
        'for',
        'autocomplete',
        'maxlength',
        'minlength',
        'pattern',
        'readonly',
        'multiple',
        'if',
    ] as const;
    const htmlAttributes: Record<string, string> = {};
    let hasHtmlAttributes = false;
    for (const attr of HTML_ATTRS_TO_CAPTURE) {
        const val = element.getAttribute(attr);
        if (val !== null && val !== undefined) {
            htmlAttributes[attr] = val;
            hasHtmlAttributes = true;
        }
    }

    const repeaterForDisambiguation = ctx.isDefaultScenario !== false ? repeaterDataMap : undefined;
    const enrichment = sourceId
        ? selectBestEnrichmentCandidate(
              element,
              sourceId,
              computedStyleMap,
              repeaterForDisambiguation,
          )
        : { data: undefined, confidence: 'none' as const };
    const enrichedStyles = enrichment.data;

    if (enrichment.ambiguityWarning) {
        warnings.push(`SID_AMBIGUITY: ${enrichment.ambiguityWarning}`);
    }

    if (enrichedStyles?.styles['display'] === 'none') {
        return null;
    }

    // Re-import guard: for text elements with static source content, prefer source over enrichment.
    // Wrong sid mapping on re-import can assign sibling text (e.g. "✕Search") to page-title.
    // When source has static text (no { binding), trust it — reject enrichment for text and dimensions.
    let effectiveEnrichedStyles = enrichedStyles;
    if (isTextElement(element)) {
        const sourceText = flattenTextContent(element);
        const sourceNorm = sourceText.replace(/\s+/g, ' ').trim();
        const hasStaticSource = sourceNorm.length > 0 && !sourceNorm.includes('{');
        const enrichedNorm = enrichedStyles?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

        if (hasStaticSource) {
            // Source has static text — check for mismatch (wrong enrichment candidate)
            if (
                enrichedNorm &&
                sourceNorm !== enrichedNorm &&
                !sourceNorm.includes(enrichedNorm) &&
                !enrichedNorm.includes(sourceNorm)
            ) {
                effectiveEnrichedStyles = undefined;
                warnings.push(
                    `TEXT_MISMATCH_GUARD: sid=${sourceId} enriched="${enrichedNorm.slice(0, 40)}" != source="${sourceNorm.slice(0, 40)}", rejecting enrichment (re-import sid drift)`,
                );
            }
        }
    }

    let classOnlyBaselineInput =
        className && effectiveEnrichedStyles?.classOnlyStyles
            ? effectiveEnrichedStyles.classOnlyStyles
            : undefined;

    if (
        !classOnlyBaselineInput &&
        classAttr &&
        styleAttr &&
        styleAttr.trim().length > 0 &&
        cssClassMap &&
        cssClassMap.size > 0
    ) {
        const staticClassStyles = resolveClassStyles(classAttr, cssClassMap);
        if (Object.keys(staticClassStyles).length > 0) {
            classOnlyBaselineInput = extractStaticClassOnlySafeProps(staticClassStyles);
        }
    }

    if (sourceId && effectiveEnrichedStyles?.boundingRect) {
        const r = effectiveEnrichedStyles.boundingRect;
        const d = effectiveEnrichedStyles.styles['display'];
        if (d === 'flex' || tag === 'input' || tag === 'button') {
            console.log(
                `[IR] ${tag} sid=${sourceId}: enriched w=${r.width} h=${r.height} display=${d || 'n/a'} bg=${effectiveEnrichedStyles.styles['background-color'] || 'n/a'}`,
            );
        }
    } else if (sourceId && !enrichedStyles) {
        if (tag === 'input' || tag === 'button') {
            console.log(`[IR] ${tag} sid=${sourceId}: NO enrichment found`);
        }
    }

    const {
        style,
        warnings: styleWarnings,
        unsupportedCss,
    } = resolveStyle(styleAttr, classNames, cssClassMap, effectiveEnrichedStyles);
    warnings.push(...styleWarnings);

    // Populate background-image ref from enriched data (first URL only in MVP)
    if (effectiveEnrichedStyles?.image?.backgroundImageUrls?.length) {
        const bgUrl = effectiveEnrichedStyles.image.backgroundImageUrls[0];
        const bgSize = effectiveEnrichedStyles.image.backgroundSize;
        const scaleMode = bgSize === 'contain' ? ('FIT' as const) : ('FILL' as const);
        style.backgroundImageRef = { sourceUrl: bgUrl, kind: 'background-image', scaleMode };
    }

    const { bindings, warnings: bindingWarnings } = extractBindingsFromElement(
        element,
        contractTags,
        jayPageSectionId,
        pageContractPath,
        repeaterContext,
        contractContext,
    );
    warnings.push(...bindingWarnings);

    let name = element.getAttribute('ref') || element.getAttribute('id') || tag;

    // Descriptive naming for form elements
    if (tag === 'button') {
        const btnText = element.textContent?.trim().substring(0, 30);
        if (btnText) name = `button: ${btnText}`;
    } else if (tag === 'label') {
        const forAttr = element.getAttribute('for');
        if (forAttr) name = `label: ${forAttr}`;
    } else if (tag === 'textarea') {
        const taName = htmlAttributes['name'];
        if (taName) name = `textarea: ${taName}`;
    }

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
            className,
            htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
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
        const enrichedObjectFit = enrichedStyles?.image?.objectFit;
        const objectFit = (['fill', 'contain', 'cover', 'none', 'scale-down'] as const).find(
            (v) => v === (enrichedObjectFit || objectFitRaw),
        );

        const resolvedSrc = enrichedStyles?.image?.renderedSrc;
        const imageUrl = resolvedSrc || src;
        const scaleMode = objectFit === 'contain' ? ('FIT' as const) : ('FILL' as const);

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'IMAGE',
            name,
            tagName: tag,
            className,
            visible: true,
            style,
            image: {
                src,
                resolvedSrc,
                alt,
                objectFit,
                imageRef: imageUrl
                    ? { sourceUrl: imageUrl, kind: 'img-src', scaleMode }
                    : undefined,
            },
            htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: [],
        };
        return { node, warnings, componentSets };
    }

    if (isTextElement(element)) {
        const sourceText = flattenTextContent(element);
        const enrichedText = effectiveEnrichedStyles?.textContent?.trim();
        const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
        const sourceNorm = norm(sourceText);
        const enrichedNorm = enrichedText ? norm(enrichedText) : '';

        // Use enriched only when we have it and it matches source (or source is empty).
        // When effectiveEnrichedStyles was rejected above (TEXT_MISMATCH_GUARD), use source.
        const textsMatch =
            !sourceNorm ||
            sourceNorm === enrichedNorm ||
            sourceNorm.includes(enrichedNorm) ||
            enrichedNorm.includes(sourceNorm);
        const useEnriched =
            enrichment.confidence === 'high' &&
            enrichedNorm &&
            textsMatch &&
            effectiveEnrichedStyles != null;

        const characters = useEnriched ? effectiveEnrichedStyles!.textContent! : sourceText;

        if (enrichment.confidence !== 'high' && enrichedText && enrichedText !== sourceText) {
            warnings.push(
                `TEXT_OVERRIDE_SKIPPED: sid=${sourceId} enrichment confidence low, using source text`,
            );
        }

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
                className: undefined,
                htmlAttributes: undefined,
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
                className,
                visible: true,
                style,
                htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
                bindings: bindings.length > 0 ? bindings : undefined,
                warnings: warnings.length > 0 ? [...warnings] : undefined,
                children: [textChild],
                classOnlyBaselineInput,
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
            className,
            visible: true,
            style,
            text: { characters },
            htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: [],
        };
        return { node, warnings, componentSets };
    }

    // forEach (repeater) — all children under the forEach element form the item template.
    const forEachAttr = element.getAttribute('forEach');
    if (forEachAttr != null && forEachAttr.trim()) {
        const forEachPath = forEachAttr.trim().split('.');
        const newRepeaterContext = [...repeaterContext, forEachPath];

        const children: ImportIRNode[] = [];

        for (const childNode of element.childNodes) {
            if (childNode.nodeType === NodeType.TEXT_NODE) {
                const raw = (childNode as any).rawText ?? (childNode as any).text ?? '';
                const text = raw.trim();
                if (text) {
                    const textId = generateNodeId(domPath + `/text-${children.length}`);
                    children.push({
                        id: textId,
                        sourcePath: domPath + `/text-${children.length}`,
                        kind: 'TEXT',
                        name: text.substring(0, 20),
                        tagName: 'span',
                        className: undefined,
                        htmlAttributes: undefined,
                        visible: true,
                        style: {
                            fontFamily: style.fontFamily,
                            fontSize: style.fontSize,
                            fontWeight: style.fontWeight,
                            textColor: style.textColor,
                            lineHeight: style.lineHeight,
                            letterSpacing: style.letterSpacing,
                        },
                        text: { characters: text },
                        children: [],
                    });
                }
                continue;
            }

            if (childNode.nodeType !== NodeType.ELEMENT_NODE) continue;
            const childEl = childNode as HTMLElement;
            const childTag = (childEl.rawTagName || '').toLowerCase();
            if (childTag === 'script' || childTag === 'style' || childTag === 'link') continue;

            const childResult = buildNodeFromElement(childEl, {
                ...ctx,
                repeaterContext: newRepeaterContext,
            });
            if (childResult) {
                children.push(childResult.node);
                warnings.push(...childResult.warnings);
                componentSets.push(...childResult.componentSets);
            }
        }

        const templateWrapper: ImportIRNode = {
            id: nodeId,
            kind: 'FRAME',
            sourcePath: domPath,
            children,
        };
        const demoItems = extractDemoItems(templateWrapper, repeaterDataMap);

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'FRAME',
            name,
            tagName: tag,
            className,
            visible: true,
            style,
            htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children,
            demoItems: demoItems.length > 0 ? demoItems : undefined,
            classOnlyBaselineInput,
        };
        return { node, warnings, componentSets };
    }

    // <select> — collect <option> children into selectOptions, don't recurse
    if (tag === 'select') {
        const options = collectSelectOptions(element);
        const selectedText = options.find((o) => o.selected)?.text || options[0]?.text || '';
        const selectName = htmlAttributes['name'] || name;

        const textChild: ImportIRNode = {
            id: generateNodeId(domPath + '/selected-text'),
            sourcePath: domPath + '/selected-text',
            kind: 'TEXT',
            name: selectedText.substring(0, 20) || 'select',
            tagName: 'span',
            visible: true,
            style: { ...style, width: undefined, height: undefined },
            text: { characters: selectedText },
        };

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'FRAME',
            name: `select: ${selectName}`,
            tagName: 'select',
            className,
            visible: true,
            style,
            htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
            selectOptions: options,
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: [textChild],
            classOnlyBaselineInput,
        };
        return { node, warnings, componentSets };
    }

    // <input> — void element, add text child with value/placeholder
    if (tag === 'input') {
        const inputType = htmlAttributes['type'] || 'text';
        const inputName = htmlAttributes['name'] || name;
        const renderedValue = enrichedStyles?.inputValue;
        const sourceValue = htmlAttributes['value'];
        const isSourceTemplate = sourceValue != null && /\{[^}]+\}/.test(sourceValue);
        const effectiveSource = isSourceTemplate ? undefined : sourceValue;
        const displayText = renderedValue || effectiveSource || htmlAttributes['placeholder'] || '';
        const isPlaceholder = !renderedValue && !effectiveSource;
        const inputChildren: ImportIRNode[] = [];

        if (displayText) {
            inputChildren.push({
                id: generateNodeId(domPath + '/input-text'),
                sourcePath: domPath + '/input-text',
                kind: 'TEXT',
                name: displayText.substring(0, 20),
                tagName: 'span',
                visible: true,
                style: {
                    ...(isPlaceholder ? { opacity: 0.5 } : {}),
                },
                text: { characters: displayText },
            });
        }

        const node: ImportIRNode = {
            id: nodeId,
            sourcePath: domPath,
            kind: 'FRAME',
            name: `input[${inputType}]: ${inputName}`,
            tagName: 'input',
            className,
            visible: true,
            style,
            htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
            unsupportedCss: Object.keys(unsupportedCss).length > 0 ? unsupportedCss : undefined,
            bindings: bindings.length > 0 ? bindings : undefined,
            warnings: warnings.length > 0 ? [...warnings] : undefined,
            children: inputChildren,
            classOnlyBaselineInput,
        };
        return { node, warnings, componentSets };
    }

    // FRAME — recurse into children, detecting variant groups
    // Pre-flatten display:contents wrappers so the variant detector
    // and child processing see the logical children, not the wrapper divs.
    flattenDisplayContentsWrappers(element);
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

    // Process all child nodes in DOM order to preserve bare text nodes
    for (const childNode of element.childNodes) {
        if (childNode.nodeType === NodeType.TEXT_NODE) {
            const raw = (childNode as any).rawText ?? (childNode as any).text ?? '';
            const text = raw.trim();
            if (text) {
                const textId = generateNodeId(domPath + `/text-${children.length}`);
                children.push({
                    id: textId,
                    sourcePath: domPath + `/text-${children.length}`,
                    kind: 'TEXT',
                    name: text.substring(0, 20),
                    tagName: 'span',
                    className: undefined,
                    htmlAttributes: undefined,
                    visible: true,
                    style: {
                        fontFamily: style.fontFamily,
                        fontSize: style.fontSize,
                        fontWeight: style.fontWeight,
                        textColor: style.textColor,
                        lineHeight: style.lineHeight,
                        letterSpacing: style.letterSpacing,
                    },
                    text: { characters: text },
                    children: [],
                });
            }
            continue;
        }

        if (childNode.nodeType !== NodeType.ELEMENT_NODE) continue;
        const childEl = childNode as HTMLElement;
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

                const result = buildNodeFromElement(el, {
                    ...ctx,
                    computedStyleMap: scenarioStyleMap ?? computedStyleMap,
                    isDefaultScenario: !scenarioStyleMap,
                });
                if (!result) {
                    return { id: '', kind: 'FRAME', sourcePath: '', children: [] };
                }
                warnings.push(...result.warnings);
                componentSets.push(...result.componentSets);
                return result.node;
            };

            const defaultStyleMap = perScenarioMaps?.get('default');
            const visibilityChecker = defaultStyleMap
                ? (el: HTMLElement) => {
                      const sid = elementSourceId(el, sourceHtml);
                      if (!sid) return undefined;
                      const data = defaultStyleMap.get(sid);
                      if (!data) return undefined;
                      return data.styles?.display !== 'none';
                  }
                : undefined;

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
                visibilityChecker,
                repeaterContext,
            );
            componentSets.push(componentSet);
            children.push(instance);
            warnings.push(...variantWarnings);
            continue;
        }

        const childResult = buildNodeFromElement(childEl, ctx);
        if (childResult) {
            children.push(childResult.node);
            warnings.push(...childResult.warnings);
            componentSets.push(...childResult.componentSets);
        }
    }

    const hasUnsupported = Object.keys(unsupportedCss).length > 0;
    const node: ImportIRNode = {
        id: nodeId,
        sourcePath: domPath,
        kind: 'FRAME',
        name,
        tagName: tag,
        className,
        visible: true,
        style,
        htmlAttributes: hasHtmlAttributes ? htmlAttributes : undefined,
        unsupportedCss: hasUnsupported ? unsupportedCss : undefined,
        bindings: bindings.length > 0 ? bindings : undefined,
        warnings: warnings.length > 0 ? [...warnings] : undefined,
        children,
        classOnlyBaselineInput,
    };
    return { node, warnings, componentSets };
}

/**
 * Find the scenario whose styles should apply to an element with a given `if` condition.
 *
 * Since scenarios are condition-driven (generated directly from each `if` condition),
 * the scenario for a condition is the one whose tag paths match the tag paths in
 * the condition. Uses a multi-strategy approach:
 *
 * 1. **Exact ID reconstruction** — for simple cases (==, truthy/negated) where we can
 *    build the same deterministic ID the generator used.
 * 2. **Tag-path matching** — for operators like !=, >, <, >=, <= where the exact
 *    value depends on contract info we don't have here. Find the scenario whose
 *    tag paths are a superset of this condition's tag paths.
 */
function findScenarioForCondition(
    condition: string,
    perScenarioMaps?: ScenarioStyleMaps,
    scenarios?: VariantScenario[],
): ComputedStyleMap | undefined {
    if (!perScenarioMaps || !scenarios || perScenarioMaps.size === 0) return undefined;

    const tokens = tokenizeCondition(condition);
    if (tokens.length === 0) return undefined;

    // Strategy 1: Try to build the exact override map for simple operators
    const overrides: Record<string, string> = {};
    const tagPaths: string[] = [];
    let allSimple = true;

    for (const token of tokens) {
        if (token.isComputed || token.path.length === 0) continue;
        const tagPath = token.path.join('.');
        tagPaths.push(tagPath);

        if (token.operator === '==' && token.comparedValue != null) {
            overrides[tagPath] = token.comparedValue;
        } else if (!token.operator) {
            overrides[tagPath] = token.isNegated ? 'false' : 'true';
        } else {
            allSimple = false;
        }
    }

    // If all tokens are simple, try exact match first
    if (allSimple && Object.keys(overrides).length > 0) {
        const exactId = Object.entries(overrides)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('&');

        const exactMatch = perScenarioMaps.get(exactId);
        if (exactMatch) return exactMatch;
    }

    if (tagPaths.length === 0) return undefined;

    // Strategy 2: Find scenario whose tag paths match this condition's tag paths.
    // Parse each scenario ID into its tag paths and find one that covers all of ours.
    for (const scenario of scenarios) {
        if (scenario.id === 'default') continue;

        const scenarioTagPaths = new Set(scenario.id.split('&').map((part) => part.split('=')[0]));
        const allCovered = tagPaths.every((tp) => scenarioTagPaths.has(tp));
        if (allCovered && scenarioTagPaths.size === tagPaths.length) {
            const map = perScenarioMaps.get(scenario.id);
            if (map) return map;
        }
    }

    // Strategy 3: Superset match (scenario covers our paths but may have more)
    for (const scenario of scenarios) {
        if (scenario.id === 'default') continue;

        const scenarioTagPaths = new Set(scenario.id.split('&').map((part) => part.split('=')[0]));
        const allCovered = tagPaths.every((tp) => scenarioTagPaths.has(tp));
        if (allCovered) {
            const map = perScenarioMaps.get(scenario.id);
            if (map) return map;
        }
    }

    // Strategy 4: Single-path fallback for the first tag path
    if (tagPaths.length > 0) {
        for (const scenario of scenarios) {
            if (scenario.id === 'default') continue;
            if (scenario.id.startsWith(`${tagPaths[0]}=`)) {
                const map = perScenarioMaps.get(scenario.id);
                if (map) return map;
            }
        }
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
        sourceHtml?: string;
        contentHash?: string;
        computedStyleMap?: ComputedStyleMap;
        repeaterDataMap?: RepeaterDataMap;
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
        const result = buildNodeFromElement(contentElement, {
            body,
            contractTags,
            jayPageSectionId: sectionId,
            pageContractPath,
            repeaterContext: [],
            contractContext,
            cssClassMap,
            computedStyleMap: options?.computedStyleMap,
            repeaterDataMap: options?.repeaterDataMap,
            perScenarioMaps: options?.perScenarioMaps,
            scenarios: options?.scenarios,
            sourceHtml: options?.sourceHtml,
        });
        if (result) {
            rootChildren = [result.node, ...result.componentSets];
            warnings.push(...result.warnings);
        }
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
