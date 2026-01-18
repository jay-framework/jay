import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import { getPositionStyle, getNodeSizeStyles, getCommonStyles, getBorderRadius } from '../utils';

/**
 * Converts a node marked as <img> semantic HTML to an image tag
 * Handles both:
 * - Bound images: src attribute bound to contract tag
 * - Static images: src points to extracted image from Figma fills
 *
 * @param node - The serialized node (FRAME or RECTANGLE with img semantic)
 * @param indent - Indentation string
 * @param srcBinding - Optional src attribute binding (e.g., "{productPage.imageUrl}")
 * @param altBinding - Optional alt attribute binding (e.g., "{productPage.imageAlt}")
 * @param refAttr - Optional ref attribute (e.g., ' ref="productImage"')
 * @param staticImageUrl - Optional URL for static image extracted from fills
 */
export function convertImageNodeToHtml(
    node: FigmaVendorDocument,
    indent: string,
    srcBinding?: string,
    altBinding?: string,
    refAttr?: string,
    staticImageUrl?: string,
): string {
    const { name, id } = node;

    // Get positioning styles
    const positionStyle = getPositionStyle(node);

    // Get common styles (opacity, rotation, effects, etc.)
    const commonStyles = getCommonStyles(node);

    // Get border radius
    const borderRadius = getBorderRadius(node);

    // Get size styles for auto layout compatibility
    const sizeStyles = getNodeSizeStyles(node);

    // Build the style string (excluding background fills since this is an image)
    const styles = `${positionStyle}${sizeStyles}${borderRadius}${commonStyles}`.trim();

    // Determine src
    let src = '';
    if (srcBinding) {
        // Bound image: use the binding expression
        src = srcBinding;
    } else if (staticImageUrl) {
        // Static image: use the extracted URL
        src = staticImageUrl;
    } else {
        // Fallback: placeholder
        src = '/placeholder-image.png';
        console.warn(`Image node "${name}" (${id}) has no src binding or static image`);
    }

    // Determine alt text
    const alt = altBinding || name;

    // Build the img tag
    const refAttribute = refAttr || '';
    const styleAttribute = styles ? ` style="${styles}"` : '';
    const dataAttribute = ` data-figma-id="${id}"`;

    return `${indent}<img${dataAttribute}${refAttribute} src="${src}" alt="${alt}"${styleAttribute} />\n`;
}

/**
 * Extracts image URL from node's fills (for static images)
 * Returns the first visible image fill's URL, or undefined if none exists
 *
 * NOTE: For static images to work, the plugin serialization needs to:
 * 1. Export the image using node.exportAsync({ format: 'PNG' })
 * 2. Save it to the project's assets folder (via editor protocol or dev server)
 * 3. Include the resulting imageUrl in the fill object
 *
 * Example plugin code:
 * ```typescript
 * if (fill.type === 'IMAGE' && fill.imageHash) {
 *   const imageBytes = await figma.getImageByHash(fill.imageHash)?.getBytesAsync();
 *   if (imageBytes) {
 *     const base64 = figma.base64Encode(imageBytes);
 *     const response = await editorProtocol.saveImage({
 *       imageId: node.id + '_' + fill.imageHash,
 *       imageData: base64
 *     });
 *     serializedFill.imageUrl = response.imageUrl;
 *   }
 * }
 * ```
 *
 * @param node - The serialized node
 */
export function extractStaticImageUrl(node: FigmaVendorDocument): string | undefined {
    if (!node.fills || !Array.isArray(node.fills)) {
        return undefined;
    }

    // Find the first visible image fill
    for (const fill of node.fills) {
        if (fill.visible !== false && fill.type === 'IMAGE') {
            // Check if imageUrl was already extracted during serialization
            if (fill.imageUrl) {
                return fill.imageUrl;
            }

            // If imageHash is present but no URL, log a warning
            if (fill.imageHash) {
                console.warn(
                    `Image fill with hash "${fill.imageHash}" found on node "${node.name}" (${node.id}) ` +
                        'but no imageUrl in serialized data. Update plugin serialization to export and save images.',
                );
            }

            return undefined;
        }
    }

    return undefined;
}
