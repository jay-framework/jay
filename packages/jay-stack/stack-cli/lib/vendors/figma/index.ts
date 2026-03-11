import path from 'path';
import { Vendor, VendorConversionResult } from '../types';
import type {
    FigmaVendorDocument,
    ProjectPage,
    Plugin,
    ContractTag,
} from '@jay-framework/editor-protocol';
import {
    getPositionStyle,
    getNodeSizeStyles,
    getCommonStyles,
    getBorderRadius,
    getAutoLayoutStyles,
    getOverflowStyles,
    getBackgroundFillsStyle,
    getStrokeStyles,
    getFrameSizeStyles,
} from './utils';
import { convertTextNodeToHtml } from './converters/text';
import { convertImageNodeToHtml, extractStaticImageUrl } from './converters/image';
import { convertRectangleToHtml } from './converters/rectangle';
import { convertEllipseToHtml } from './converters/ellipse';
import { convertVectorToHtml } from './converters/vector';
import { convertVariantNode } from './converters/variants';
import { convertRepeaterNode } from './converters/repeater';
import { convertGroupNode } from './converters/group';
import type { ConversionContext, BindingAnalysis } from './types';
import { getBindingsData, analyzeBindings, validateBindings } from './binding-analysis';
import {
    buildImportIR,
    resolveContractTagLinks,
    normalizeCompilerTags,
} from './jay-html-to-import-ir';
import { adaptIRToFigmaVendorDoc } from './import-ir-to-figma-vendor-doc';

/**
 * Figma Vendor Implementation
 *
 * This converts Figma FigmaVendorDocument documents to Jay HTML body content.
 *
 * The FigmaVendorDocument type is imported from @jay-framework/editor-protocol,
 * which is the single source of truth for the vendor document structure.
 */

const SEMANTIC_HTML_TAGS = new Set([
    'header',
    'footer',
    'nav',
    'main',
    'section',
    'article',
    'aside',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'span',
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'form',
    'label',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'figure',
    'figcaption',
    'blockquote',
    'pre',
    'code',
    'details',
    'summary',
    'dialog',
]);

const VOID_ELEMENTS = new Set(['input', 'br', 'hr', 'meta', 'link']);

const TEXT_CONTAINER_TAGS = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'span',
    'label',
    'a',
    'button',
    'textarea',
    'li',
    'dt',
    'dd',
    'th',
    'td',
    'figcaption',
    'blockquote',
    'summary',
]);

/** Strip dynamic class expressions ({...}) from className to avoid compile errors outside forEach scope */
function sanitizeClassName(className: string | undefined): string | undefined {
    if (!className) return undefined;
    const cleaned = className
        .replace(/\{[^}]*\}/g, '')
        .trim()
        .replace(/\s+/g, ' ');
    return cleaned || undefined;
}

/** Recursively extract text from a node tree (for <option> etc.) */
function extractTextContent(node: FigmaVendorDocument): string {
    if (node.type === 'TEXT' && node.characters) {
        return node.characters.trim();
    }
    if (node.children) {
        return node.children.map(extractTextContent).filter(Boolean).join(' ');
    }
    return '';
}

function analyzeTextChildBindings(
    textNode: FigmaVendorDocument,
    context: ConversionContext,
): string | undefined {
    const bindingsData = getBindingsData(textNode);
    if (!bindingsData || bindingsData.length === 0) return undefined;
    const childAnalysis = analyzeBindings(bindingsData, context);
    if (childAnalysis.dynamicContentPath) return `{${childAnalysis.dynamicContentPath}}`;
    if (childAnalysis.dualPath) return `{${childAnalysis.dualPath}}`;
    return undefined;
}

function resolveHtmlTag(semanticHtml: string | undefined, nodeName: string | undefined): string {
    if (semanticHtml) return semanticHtml;
    const name = nodeName?.toLowerCase();
    if (name && SEMANTIC_HTML_TAGS.has(name)) return name;
    return 'div';
}

/**
 * Converts a regular node (non-repeater, non-variant) to Jay HTML
 */
function convertRegularNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
): string {
    const indent = '  '.repeat(context.indentLevel);
    const { type, children, pluginData } = node;

    const semanticHtml = pluginData?.['semanticHtml'];

    // For text nodes, handle specially
    if (type === 'TEXT') {
        const dynamicContent = analysis.dynamicContentPath
            ? `{${analysis.dynamicContentPath}}`
            : '';
        const refAttr = analysis.refPath ? ` ref="${analysis.refPath}"` : '';
        const dualContent = analysis.dualPath ? `{${analysis.dualPath}}` : '';
        const dualRef = analysis.dualPath ? ` ref="${analysis.dualPath}"` : '';

        // Build attribute string
        let attributesHtml = '';
        for (const [attr, tagPath] of analysis.attributes) {
            attributesHtml += ` ${attr}="{${tagPath}}"`;
        }

        return convertTextNodeToHtml(
            node,
            indent,
            dynamicContent || dualContent,
            refAttr || dualRef,
            attributesHtml,
        );
    }

    // For SVG semantic nodes, emit raw SVG markup from pluginData
    if (semanticHtml === 'svg' && pluginData?.['svgData']) {
        return `${indent}${pluginData['svgData']}\n`;
    }

    // For image semantic nodes, handle specially
    if (semanticHtml === 'img') {
        let srcBinding: string | undefined;
        let altBinding: string | undefined;

        for (const [attr, tagPath] of analysis.attributes) {
            if (attr === 'src') {
                srcBinding = `{${tagPath}}`;
            } else if (attr === 'alt') {
                altBinding = `{${tagPath}}`;
            }
        }

        // Fall back to pluginData entries stored during import
        if (!srcBinding && pluginData?.['imgSrc']) {
            srcBinding = pluginData['imgSrc'];
        }
        if (!altBinding && pluginData?.['imgAlt']) {
            altBinding = pluginData['imgAlt'];
        }

        let staticImageUrl: string | undefined;
        if (!srcBinding) {
            staticImageUrl = extractStaticImageUrl(node);
        }

        const refAttr = analysis.refPath
            ? ` ref="${analysis.refPath}"`
            : analysis.dualPath
              ? ` ref="${analysis.dualPath}"`
              : '';

        return convertImageNodeToHtml(
            node,
            indent,
            srcBinding,
            altBinding,
            refAttr,
            staticImageUrl,
        );
    }

    // Get position, size, and common styles
    const positionStyle = getPositionStyle(node);
    const sizeStyles = getNodeSizeStyles(node);
    const commonStyles = getCommonStyles(node);

    // For frames, build full styling
    let styleAttr = '';
    if (type === 'FRAME') {
        const backgroundStyle = getBackgroundFillsStyle(node);
        const borderRadius = getBorderRadius(node);
        const strokeStyles = getStrokeStyles(node);
        const flexStyles = getAutoLayoutStyles(node);
        const overflowStyles = getOverflowStyles(node);
        const frameSizeStyles = getFrameSizeStyles(node);

        styleAttr = `${positionStyle}${frameSizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${overflowStyles}${commonStyles}${flexStyles}box-sizing: border-box;`;
    } else {
        styleAttr = `${positionStyle}${sizeStyles}${commonStyles}`;
    }

    // Determine HTML tag: prefer semanticHtml from pluginData, then node.name if it's a known semantic tag
    const tag = resolveHtmlTag(semanticHtml, node.name);
    const cssClassName = sanitizeClassName(pluginData?.['className']);

    // When CSS classes are present, they already define layout/styling from the
    // original stylesheet. Inline styles from computed values would override them
    // and break the layout (e.g. display:grid → display:flex). Skip inline styles
    // for elements with classes to preserve the original visual appearance.
    let effectiveStyle = cssClassName ? '' : styleAttr;

    // Merge unsupported CSS stored during import (properties Figma can't represent).
    // Only needed for inline-styled nodes; class-based nodes already have these in the stylesheet.
    if (!cssClassName && pluginData?.['jay-unsupported-css']) {
        try {
            const unsupported = JSON.parse(pluginData['jay-unsupported-css']) as Record<
                string,
                string
            >;
            const existingProps = new Set<string>();
            for (const part of effectiveStyle.split(';')) {
                const colonIdx = part.indexOf(':');
                if (colonIdx > 0) existingProps.add(part.substring(0, colonIdx).trim());
            }
            for (const [prop, value] of Object.entries(unsupported)) {
                if (!existingProps.has(prop)) effectiveStyle += `${prop}: ${value};`;
            }
        } catch {
            // Invalid JSON — skip silently
        }
    }

    // Build HTML attributes
    let htmlAttrs = '';
    if (cssClassName) {
        htmlAttrs += `class="${cssClassName}" `;
    }
    if (effectiveStyle) {
        htmlAttrs += ` style="${effectiveStyle}"`;
    }

    // Add ref attribute
    if (analysis.refPath) {
        htmlAttrs += ` ref="${analysis.refPath}"`;
    } else if (analysis.dualPath) {
        htmlAttrs += ` ref="${analysis.dualPath}"`;
    }

    // Add other attributes (like src, href, value, etc.)
    for (const [attr, tagPath] of analysis.attributes) {
        htmlAttrs += ` ${attr}="{${tagPath}}"`;
    }

    // Fall back to raw HTML attributes stored during import (for bindings that
    // didn't resolve against the contract but should still be preserved)
    const rawHtmlAttrs = pluginData?.['htmlAttributes']
        ? (JSON.parse(pluginData['htmlAttributes']) as Record<string, string>)
        : undefined;
    if (rawHtmlAttrs) {
        const alreadyEmitted = new Set(Array.from(analysis.attributes.keys()));
        for (const [attr, val] of Object.entries(rawHtmlAttrs)) {
            if (!alreadyEmitted.has(attr) && attr !== 'style' && attr !== 'class') {
                htmlAttrs += ` ${attr}="${val}"`;
            }
        }
    }

    // Handle based on node type
    if (type === 'RECTANGLE') {
        return convertRectangleToHtml(node, indent);
    } else if (type === 'ELLIPSE') {
        return convertEllipseToHtml(node, indent);
    } else if (type === 'GROUP') {
        return convertGroupNode(node, analysis, context, convertNodeToJayHtml);
    } else if (
        type === 'VECTOR' ||
        type === 'STAR' ||
        type === 'POLYGON' ||
        type === 'LINE' ||
        type === 'BOOLEAN_OPERATION'
    ) {
        return convertVectorToHtml(node, indent);
    }

    // Void HTML elements (input, br, hr) are self-closing and can't have children
    if (VOID_ELEMENTS.has(tag)) {
        return `${indent}<${tag} ${htmlAttrs} />\n`;
    }

    // <select> — reconstruct <option> children from jay-select-options pluginData
    if (tag === 'select' && pluginData?.['jay-select-options']) {
        try {
            const options = JSON.parse(pluginData['jay-select-options']) as Array<{
                value: string;
                text: string;
                selected?: boolean;
            }>;
            const childIndent = '  '.repeat(context.indentLevel + 1);
            let html = `${indent}<${tag} ${htmlAttrs}>\n`;
            for (const opt of options) {
                const selectedAttr = opt.selected ? ' selected' : '';
                html += `${childIndent}<option value="${opt.value}"${selectedAttr}>${opt.text}</option>\n`;
            }
            html += `${indent}</${tag}>\n`;
            return html;
        } catch {
            // Fall through to normal processing if JSON is invalid
        }
    }

    // <option> elements should emit plain text content, not nested divs
    if (tag === 'option') {
        const textContent = extractTextContent(node);
        return `${indent}<${tag} ${htmlAttrs}>${textContent}</${tag}>\n`;
    }

    if (children && children.length > 0) {
        // When a semantic text element (h1-h6, p, span, etc.) with CSS classes
        // has a single TEXT child, emit the text content directly inside the tag.
        // During import, text content bindings (e.g. {name}) are stored on the
        // parent FRAME, not the TEXT child.  Check both.
        const isTextContainer = TEXT_CONTAINER_TAGS.has(tag) && cssClassName;
        if (isTextContainer && children.length === 1 && children[0].type === 'TEXT') {
            const textChild = children[0];
            const textContent = textChild.characters || '';
            const childAnalysis = analyzeTextChildBindings(textChild, context);
            const parentDynamic = analysis.dynamicContentPath
                ? `{${analysis.dynamicContentPath}}`
                : analysis.dualPath
                  ? `{${analysis.dualPath}}`
                  : undefined;
            const content = childAnalysis || parentDynamic || textContent;
            return `${indent}<${tag} ${htmlAttrs}>${content}</${tag}>\n`;
        }

        let html = `${indent}<${tag} ${htmlAttrs}>\n`;

        const childContext: ConversionContext = {
            ...context,
            indentLevel: context.indentLevel + 1,
        };

        for (const child of children) {
            html += convertNodeToJayHtml(child, childContext);
        }

        html += `${indent}</${tag}>\n`;
        return html;
    }

    // Leaf nodes with no children and no content - skip
    return '';
}
/**
 * Main converter for Figma nodes to Jay HTML
 * Implements the conversion pipeline with binding analysis
 */
function convertNodeToJayHtml(node: FigmaVendorDocument, context: ConversionContext): string {
    const { name, type, children, pluginData } = node;
    // Extract Jay-specific data from pluginData
    const isJPage = pluginData?.['jpage'] === 'true';
    const urlRoute = pluginData?.['urlRoute'];

    // Collect font family if this is a TEXT node
    if (type === 'TEXT' && node.fontName) {
        if (typeof node.fontName === 'object' && node.fontName.family) {
            context.fontFamilies.add(node.fontName.family);
        }
    }

    const indent = '  '.repeat(context.indentLevel);

    // Handle Jay Page sections (don't process bindings for top-level sections)
    if (type === 'SECTION' && isJPage) {
        let html = `${indent}<section data-page-url="${urlRoute || ''}">\n`;

        if (children && children.length > 0) {
            const childContext: ConversionContext = {
                ...context,
                indentLevel: context.indentLevel + 1,
            };
            for (const child of children) {
                html += convertNodeToJayHtml(child, childContext);
            }
        }

        html += `${indent}</section>\n`;
        return html;
    }

    // 1. Get bindings from plugin data
    const bindings = getBindingsData(node);

    // 2. Analyze bindings
    const analysis = analyzeBindings(bindings, context);

    // 3. Validate bindings
    validateBindings(analysis, node);

    // 4. Handle repeater
    if (analysis.isRepeater) {
        return convertRepeaterNode(node, analysis, context, convertNodeToJayHtml);
    }

    // 5. Handle property variants
    if (analysis.type === 'property-variant') {
        return convertVariantNode(node, analysis, context, convertNodeToJayHtml);
    }

    // 6. Convert regular node
    return convertRegularNode(node, analysis, context);
}

/**
 * Finds the content FrameNode from a Jay Page section's children
 * @param section - The Jay Page section node
 * @returns The content FrameNode, or null with error/warning info
 */
function findContentFrame(section: FigmaVendorDocument): {
    frame: FigmaVendorDocument | null;
    error?: string;
    warning?: string;
} {
    if (!section.children || section.children.length === 0) {
        return {
            frame: null,
            error: `Jay Page section "${section.name}" has no children`,
        };
    }

    // Find all FrameNodes among the children
    const frameNodes = section.children.filter((child) => child.type === 'FRAME');

    if (frameNodes.length === 0) {
        return {
            frame: null,
            error: `Jay Page section "${section.name}" has no FrameNode children. Found: ${section.children.map((c) => c.type).join(', ')}`,
        };
    }

    if (frameNodes.length > 1) {
        return {
            frame: frameNodes[0],
            warning: `Jay Page section "${section.name}" has ${frameNodes.length} FrameNodes, using the first one`,
        };
    }

    // Exactly one frame found - ideal case
    return { frame: frameNodes[0] };
}

export const figmaVendor: Vendor<FigmaVendorDocument> = {
    vendorId: 'figma',

    async convertToBodyHtml(
        vendorDoc: FigmaVendorDocument,
        pageUrl: string,
        projectPage: ProjectPage,
        plugins: Plugin[],
    ): Promise<VendorConversionResult> {
        console.log(`🎨 Converting Figma document for page: ${pageUrl}`);
        console.log(`   Document type: ${vendorDoc.type}, name: ${vendorDoc.name}`);

        // Check if this is a Jay Page
        const isJPage = vendorDoc.pluginData?.['jpage'] === 'true';
        if (!isJPage) {
            throw new Error(
                `Document "${vendorDoc.name}" is not marked as a Jay Page (missing jpage='true' in pluginData)`,
            );
        }

        // Find the content FrameNode
        const { frame, error, warning } = findContentFrame(vendorDoc);

        if (error) {
            throw new Error(`Cannot convert to Jay HTML: ${error}`);
        }

        if (warning) {
            console.warn(`⚠️  ${warning}`);
        }

        if (!frame) {
            throw new Error(`Cannot convert to Jay HTML: No content frame found`);
        }

        console.log(`   Converting content frame: ${frame.name} (${frame.type})`);

        // Create empty set to collect font families during conversion
        const fontFamilies = new Set<string>();

        // Build component set index for resolving INSTANCE variant data
        const componentSetIndex = new Map<string, FigmaVendorDocument>();
        function indexComponentSets(node: FigmaVendorDocument) {
            if (node.type === 'COMPONENT_SET' && node.children) {
                for (const child of node.children) {
                    if (child.type === 'COMPONENT') {
                        componentSetIndex.set(child.id, node);
                    }
                }
            }
            if (node.children) {
                for (const child of node.children) indexComponentSets(child);
            }
        }
        indexComponentSets(vendorDoc);

        // Create conversion context
        const context: ConversionContext = {
            repeaterPathStack: [],
            indentLevel: 1, // Start at 1 for body content
            fontFamilies,
            projectPage,
            plugins,
            componentSetIndex,
        };

        // Convert the content frame to body HTML (fontFamilies will be populated during conversion)
        const bodyHtml = convertNodeToJayHtml(frame, context);

        if (fontFamilies.size > 0) {
            console.log(
                `   Found ${fontFamilies.size} font families: ${Array.from(fontFamilies).join(', ')}`,
            );
        }

        return {
            bodyHtml,
            fontFamilies,
            contractData: undefined,
        };
    },

    async convertFromJayHtml(parsedJayHtml, pageUrl, projectPage, plugins, options) {
        let computedStyleMap;
        let perScenarioMaps;
        let enricherScenarios: any[] = [];
        let repeaterDataMap;

        try {
            const { enrichWithComputedStyles, generateVariantScenarios } = await import(
                './computed-style-enricher'
            );

            const devServerUrl =
                options?.devServerUrl || process.env.DEV_SERVER_URL || 'http://localhost:3000';
            console.log(`[Import] Using dev server URL: ${devServerUrl}`);

            const mergedTags: ContractTag[] = [...(projectPage.contract?.tags ?? [])];
            if (parsedJayHtml.headlessImports) {
                for (const hi of parsedJayHtml.headlessImports) {
                    if (hi.key && hi.contract?.tags) {
                        const contractDir = hi.contractPath
                            ? path.dirname(hi.contractPath)
                            : undefined;
                        const resolvedTags = contractDir
                            ? resolveContractTagLinks(
                                  hi.contract.tags as unknown[],
                                  contractDir,
                              )
                            : (hi.contract.tags as unknown[]);
                        mergedTags.push({
                            tag: hi.key,
                            type: 'subContract',
                            tags: normalizeCompilerTags(resolvedTags),
                        });
                    }
                }
            }

            const scenarios = generateVariantScenarios(parsedJayHtml.body, mergedTags, 16);
            console.log(
                `[Import] Generated ${scenarios.length - 1} variant scenario(s) from ${mergedTags.length} merged contract tags`,
            );

            console.log('[Import] Computing styles via headless browser...');
            const enricherResult = await enrichWithComputedStyles({
                pageRoute: pageUrl,
                devServerUrl,
                scenarios,
                timeout: 30000,
                maxScenarios: 16,
            });

            computedStyleMap = enricherResult.merged;
            perScenarioMaps = enricherResult.perScenario;
            enricherScenarios = enricherResult.scenarios;
            repeaterDataMap = enricherResult.repeaterDataMap;
        } catch (error) {
            console.warn('[Import] Computed style enrichment failed:', (error as Error).message);
            computedStyleMap = undefined;
        }

        const ir = buildImportIR(
            parsedJayHtml.body,
            pageUrl,
            projectPage.name || path.basename(pageUrl),
            {
                contract: projectPage.contract,
                headlessImports: parsedJayHtml.headlessImports,
                usedComponents: projectPage.usedComponents,
                css: parsedJayHtml.css,
                sourceHtml: parsedJayHtml.sourceHtml,
                computedStyleMap,
                perScenarioMaps,
                scenarios: enricherScenarios,
                repeaterDataMap,
            },
        );

        // Fetch and save images to disk (if publicFolder is available)
        let imageManifest: Array<{ nodeId: string; imageId: string; scaleMode: string }> = [];
        let imageUrlToId: Map<string, string> | undefined;
        if (options?.publicFolder) {
            try {
                const { fetchAndSaveImages } = await import('./image-asset-fetcher');
                const devServerUrl =
                    options?.devServerUrl || process.env.DEV_SERVER_URL || 'http://localhost:3000';
                const fetchResult = await fetchAndSaveImages(ir, {
                    devServerUrl,
                    publicFolder: options.publicFolder,
                });
                imageManifest = fetchResult.imageManifest;
                imageUrlToId = fetchResult.urlToImageId;
                if (fetchResult.warnings.length > 0) {
                    console.warn('[Import] Image warnings:', fetchResult.warnings.join('; '));
                }
            } catch (error) {
                console.warn('[Import] Image fetch failed:', (error as Error).message);
            }
        }

        const vendorDoc = adaptIRToFigmaVendorDoc(ir, { imageUrlToId });

        // Store content hash and timestamp for sync state tracking (Task 5.2)
        if (vendorDoc.type === 'SECTION' && parsedJayHtml.sourceHtml) {
            const { computeContentHash } = await import('./content-hash');
            vendorDoc.pluginData = vendorDoc.pluginData || {};
            vendorDoc.pluginData['jay-import-content-hash'] = computeContentHash(
                parsedJayHtml.sourceHtml,
            );
            vendorDoc.pluginData['jay-import-timestamp'] = new Date().toISOString();
        }

        return {
            vendorDoc,
            imageManifest: imageManifest.length > 0 ? imageManifest : undefined,
        };
    },
};
