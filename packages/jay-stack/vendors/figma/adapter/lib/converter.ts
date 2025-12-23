import {
    InterchangeNode,
    InterchangeFrame,
    InterchangeText,
    InterchangeInput,
    InterchangeFileUpload,
    InterchangeGroup,
    InterchangeVector,
    InterchangeImage,
    InterchangeInstance,
} from '@jay-framework/figma-interchange';
import { ContractContext } from '@jay-framework/dev-server';
import {
    sanitizeHtmlId,
    wrapWithLink,
    getDirectives,
    getBindings,
    shouldExportAsCompositeSvg,
} from './utils/html-utils';
import { generateStyles, generatePseudoClassStyles } from './styles/style-generator';
import { convertFileUploadNode } from './converters/file-upload';

export class FigmaToJayConverter {
    // Phase 2: State Management
    private usedFontFamilies: Set<string> = new Set();
    private componentImports: Set<string> = new Set();
    private syntheticTags: Set<string> = new Set();
    private overlayPopovers: Map<string, string> = new Map();
    private contractContext: ContractContext;

    process(node: InterchangeNode, contractContext: ContractContext): string {
        // Reset state
        this.usedFontFamilies = new Set();
        this.componentImports = new Set();
        this.syntheticTags = new Set();
        this.overlayPopovers = new Map();
        this.contractContext = contractContext;

        // Convert the main node tree
        const bodyContent = this.convertNode(node, 0);

        // Generate the full document
        return this.generateFullDocument(bodyContent);
    }

    private generateFullDocument(bodyContent: string): string {
        const headContent = [
            '<meta charset="UTF-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
            this.contractContext.contractScript,
            this.generateFontLinks(),
            this.generateGlobalStyles(),
            this.generateSyntheticStyles(),
        ]
            .filter(Boolean)
            .join('\n    ');

        const componentScripts = Array.from(this.componentImports).join('\n    ');

        // Append overlays to body
        const overlays = Array.from(this.overlayPopovers.values()).join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    ${headContent}
</head>
<body>
    ${bodyContent}
    ${overlays}
    ${componentScripts}
</body>
</html>`;
    }

    private generateFontLinks(): string {
        if (this.usedFontFamilies.size === 0) return '';

        const families = Array.from(this.usedFontFamilies)
            .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
            .join('&');

        return `<link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">`;
    }

    private generateGlobalStyles(): string {
        return `<style>
        /* Global Reset & Base Styles */
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; overflow-x: hidden; }
        
        /* Scrollbar Styling */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #C1C1C1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #A8A8A8; }
    </style>`;
    }

    private generateSyntheticStyles(): string {
        if (this.syntheticTags.size === 0) return '';
        return `<style>\n${Array.from(this.syntheticTags).join('\n')}\n</style>`;
    }

    private convertNode(node: InterchangeNode, depth: number): string {
        const indent = '  '.repeat(depth);

        // Phase 6: Vectors & Optimization
        if (shouldExportAsCompositeSvg(node)) {
            // TODO: If we have composite SVG content available (e.g. from plugin), return it here.
            // For now, fall through to normal processing which handles individual vectors.
        }

        // Special handling for file upload which needs a wrapper structure
        if (node.type === 'FILE_UPLOAD') {
            return convertFileUploadNode(node as InterchangeFileUpload, depth);
        }

        // Handle Directives
        const directives = getDirectives(node);
        const bindings = getBindings(node);

        // Phase 5: Jay Components
        if (node.jayData?.componentImport) {
            this.componentImports.add(node.jayData.componentImport);
        }

        let tagName = 'div';
        let attributes: string[] = [];
        let content = '';
        let isSelfClosing = false;

        // Determine tag name
        if (node.jayData?.semanticTag) {
            tagName = node.jayData.semanticTag;
        } else if (node.type === 'TEXT') {
            tagName = 'span';
        } else if (node.type === 'IMAGE') {
            tagName = 'img';
            isSelfClosing = true;
        } else if (node.type === 'INPUT') {
            tagName = 'input';
            isSelfClosing = true;
        }

        // Add ID
        const sanitizedId = sanitizeHtmlId(node.name, node.id);
        attributes.push(`id="${sanitizedId}"`);

        // Phase 5: Pseudo-states
        if (node.jayData?.pseudoStyles) {
            const className = `cls-${sanitizedId}`;
            attributes.push(`class="${className}"`);
            generatePseudoClassStyles(className, node.jayData.pseudoStyles, this.syntheticTags);
        }

        // Generate styles
        const styles = generateStyles(node, this.usedFontFamilies);
        if (styles) {
            attributes.push(`style="${styles}"`);
        }

        // Apply directives (conditionals and loops)
        if (directives.length > 0) {
            directives.forEach((d) => {
                if (d.type === 'if') attributes.push(`if="${d.expression}"`);
                if (d.type === 'for') {
                    // Convert j-for to proper Jay-HTML forEach syntax
                    attributes.push(`forEach="${d.expression}" trackBy="id"`);
                }
            });
        }

        // Specific Node Handling
        switch (node.type) {
            case 'FRAME':
            case 'COMPONENT':
            case 'INSTANCE':
                const frame = node as InterchangeFrame;
                if (frame.children) {
                    content =
                        '\n' +
                        frame.children.map((c) => this.convertNode(c, depth + 1)).join('\n') +
                        '\n' +
                        indent;
                }
                break;
            case 'GROUP':
                const group = node as InterchangeGroup;
                if (group.children) {
                    content =
                        '\n' +
                        group.children.map((c) => this.convertNode(c, depth + 1)).join('\n') +
                        '\n' +
                        indent;
                }
                break;
            case 'VECTOR':
                const vector = node as InterchangeVector;
                // For vectors, we need to wrap the SVG content in the div
                // SVG content should be on a new line with proper indentation
                const svgIndent = '  '.repeat(depth + 1);
                content = '\n' + svgIndent + vector.svgContent + '\n' + indent;
                break;
            case 'IMAGE':
                const image = node as InterchangeImage;
                // For images, add the src and alt attributes
                attributes.push(`src="${image.imageUrl}"`);
                attributes.push(`alt="${node.name}"`);
                // Images don't have content
                break;
            case 'INPUT':
                const input = node as InterchangeInput;
                // For inputs, add type, placeholder, and value attributes
                if (input.inputType) {
                    attributes.push(`type="${input.inputType}"`);
                }
                if (input.placeholder) {
                    attributes.push(`placeholder="${input.placeholder}"`);
                }
                if (input.value) {
                    attributes.push(`value="${input.value}"`);
                }
                // Inputs don't have content
                break;
            case 'TEXT':
                const text = node as InterchangeText;
                // Check if binding targets 'characters' or 'text'
                const textBinding = bindings.find(
                    (b) => b.targetProperty === 'characters' || b.targetProperty === 'text',
                );
                if (textBinding) {
                    // Use the contract property directly as it should be
                    content = `{${textBinding.contractProperty}}`;
                } else {
                    // No binding, use static text
                    content = text.characters;
                }
                break;
            case 'RECTANGLE':
                // div is fine
                break;
            case 'ELLIPSE':
                // Ellipse is just a div with border-radius: 50%
                break;
        }

        // Build the HTML element
        let element = '';
        if (isSelfClosing) {
            element = `${indent}<${tagName} ${attributes.join(' ')} />`;
        } else {
            element = `${indent}<${tagName} ${attributes.join(' ')}>${content}</${tagName}>`;
        }

        // Wrap with link if node has link metadata
        if (node.jayData?.link) {
            element = wrapWithLink(element, node.jayData.link, depth);
        }

        // Phase 7: Overlays
        if (node.jayData?.isOverlay) {
            // Store the element for later injection and remove from normal flow
            this.overlayPopovers.set(sanitizedId, element);
            return '';
        }

        return element;
    }
}
