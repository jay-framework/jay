import path from 'path';
import fs from 'fs';
import { Vendor, VendorConversionResult } from '../types';
import type { FigmaVendorDocument, ProjectPage, Plugin } from '@jay-framework/editor-protocol';
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
import { buildImportIR } from './jay-html-to-import-ir';
import { adaptIRToFigmaVendorDoc } from './import-ir-to-figma-vendor-doc';

/**
 * Figma Vendor Implementation
 *
 * This converts Figma FigmaVendorDocument documents to Jay HTML body content.
 *
 * The FigmaVendorDocument type is imported from @jay-framework/editor-protocol,
 * which is the single source of truth for the vendor document structure.
 */

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
        // Extract src and alt bindings
        let srcBinding: string | undefined;
        let altBinding: string | undefined;

        for (const [attr, tagPath] of analysis.attributes) {
            if (attr === 'src') {
                srcBinding = `{${tagPath}}`;
            } else if (attr === 'alt') {
                altBinding = `{${tagPath}}`;
            }
        }

        // Check for static image (no src binding)
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

    // Build HTML attributes
    const tag = semanticHtml || 'div';
    let htmlAttrs = `data-figma-id="${node.id}" data-figma-type="${type.toLowerCase()}" style="${styleAttr}"`;

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

    // Handle based on node type
    if (type === 'RECTANGLE') {
        return convertRectangleToHtml(node, indent);
    } else if (type === 'ELLIPSE') {
        return convertEllipseToHtml(node, indent);
    } else if (type === 'GROUP') {
        // Groups need special handling for layout
        return convertGroupNode(node, analysis, context, convertNodeToJayHtml);
    } else if (
        type === 'VECTOR' ||
        type === 'STAR' ||
        type === 'POLYGON' ||
        type === 'LINE' ||
        type === 'BOOLEAN_OPERATION'
    ) {
        return convertVectorToHtml(node, indent);
    } else if (children && children.length > 0) {
        // Container with children
        let html = `${indent}<${tag} ${htmlAttrs}>\n`;
        html += `${indent}  <!-- ${node.name} -->\n`;

        const childContext: ConversionContext = {
            ...context,
            indentLevel: context.indentLevel + 1,
        };

        for (const child of children) {
            html += convertNodeToJayHtml(child, childContext);
        }

        html += `${indent}</${tag}>\n`;
        return html;
    } else {
        // Leaf node
        return `${indent}<!-- ${node.name} (${type}) -->\n`;
    }
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
        let html = `${indent}<section data-figma-id="${node.id}" data-page-url="${urlRoute || ''}">\n`;
        html += `${indent}  <!-- Jay Page: ${name} -->\n`;

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

function getDebugDir(projectPage: ProjectPage): string | null {
    try {
        if (projectPage.filePath) {
            return path.dirname(projectPage.filePath);
        }
        return null;
    } catch {
        return null;
    }
}

function writeDebugFile(dir: string | null, filename: string, data: unknown): void {
    if (!dir) return;
    try {
        const debugDir = path.join(dir, '_debug');
        fs.mkdirSync(debugDir, { recursive: true });
        const filePath = path.join(debugDir, filename);
        const json = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, json, 'utf-8');
        console.log(`[Debug] Wrote ${filePath} (${(json.length / 1024).toFixed(1)}KB)`);
    } catch (e) {
        console.warn(`[Debug] Failed to write ${filename}:`, (e as Error).message);
    }
}

function irNodeSummary(node: any, depth = 0): any {
    if (!node) return null;
    const summary: any = {
        kind: node.kind,
        name: node.name,
        id: node.id,
    };
    if (node.text) summary.text = node.text;
    if (node.bindings?.length) summary.bindings = node.bindings;
    if (node.variantProperties) summary.variantProperties = node.variantProperties;
    if (node.componentPropertyDefinitions)
        summary.componentPropertyDefinitions = node.componentPropertyDefinitions;
    if (node.style) {
        const s = node.style;
        const styleKeys = Object.keys(s).filter((k) => s[k] !== undefined);
        summary.style = Object.fromEntries(styleKeys.map((k) => [k, s[k]]));
    }
    if (node.children?.length) {
        summary.childCount = node.children.length;
        if (depth < 4) {
            summary.children = node.children.map((c: any) => irNodeSummary(c, depth + 1));
        }
    }
    return summary;
}

function figmaNodeSummary(node: FigmaVendorDocument, depth = 0): any {
    if (!node) return null;
    const summary: any = {
        type: node.type,
        name: node.name,
        id: node.id,
    };
    if (node.layoutMode) summary.layoutMode = node.layoutMode;
    if (node.width) summary.width = node.width;
    if (node.height) summary.height = node.height;
    if (node.characters) summary.characters = node.characters?.substring(0, 80);
    if (node.pluginData) summary.pluginData = node.pluginData;
    if (node.variantProperties) summary.variantProperties = node.variantProperties;
    if (node.componentPropertyDefinitions)
        summary.componentPropertyDefinitions = node.componentPropertyDefinitions;
    if (node.fills?.length) summary.fillCount = node.fills.length;
    if (node.children?.length) {
        summary.childCount = node.children.length;
        if (depth < 5) {
            summary.children = node.children.map((c: any) => figmaNodeSummary(c, depth + 1));
        }
    }
    return summary;
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

        const debugDir = getDebugDir(projectPage);
        writeDebugFile(
            debugDir,
            'export-input-figma-doc-summary.json',
            figmaNodeSummary(vendorDoc),
        );
        writeDebugFile(debugDir, 'export-body-html.html', bodyHtml);
        writeDebugFile(debugDir, 'export-metadata.json', {
            pageUrl,
            fontFamilies: Array.from(fontFamilies),
            bodyHtmlLength: bodyHtml.length,
            bodyHtmlLineCount: bodyHtml.split('\n').length,
        });

        return {
            bodyHtml,
            fontFamilies,
            contractData: undefined,
        };
    },

    async convertFromJayHtml(parsedJayHtml, pageUrl, projectPage, plugins) {
        const debugDir = getDebugDir(projectPage);
        let computedStyleMap;

        writeDebugFile(debugDir, 'import-input-body.html', parsedJayHtml.body.outerHTML);
        writeDebugFile(debugDir, 'import-input-css.json', parsedJayHtml.css || null);
        writeDebugFile(debugDir, 'import-input-contract.json', projectPage.contract || null);

        try {
            const { enrichWithComputedStyles, generateVariantScenarios } = await import(
                './computed-style-enricher'
            );

            const devServerUrl = process.env.DEV_SERVER_URL || 'http://localhost:3000';
            const scenarios = generateVariantScenarios(
                parsedJayHtml.body,
                projectPage.contract,
                12,
            );

            console.log('[Import] Computing styles via headless browser...');
            computedStyleMap = await enrichWithComputedStyles({
                pageRoute: pageUrl,
                devServerUrl,
                scenarios,
                timeout: 10000,
                maxScenarios: 12,
            });

            writeDebugFile(
                debugDir,
                'import-computed-styles.json',
                computedStyleMap ? Object.fromEntries(computedStyleMap) : null,
            );
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
                computedStyleMap,
            },
        );

        writeDebugFile(debugDir, 'import-ir-summary.json', {
            route: ir.route,
            pageName: ir.pageName,
            rootSummary: irNodeSummary(ir.root),
        });
        writeDebugFile(debugDir, 'import-ir-full.json', ir);

        const vendorDoc = adaptIRToFigmaVendorDoc(ir);

        writeDebugFile(debugDir, 'import-figma-doc-summary.json', figmaNodeSummary(vendorDoc));
        writeDebugFile(debugDir, 'import-figma-doc-full.json', vendorDoc);

        return vendorDoc;
    },
};
