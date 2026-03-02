import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import { getCommonStyles, getBorderRadius } from '../utils';

export function convertImageNodeToHtml(
    node: FigmaVendorDocument,
    indent: string,
    srcBinding?: string,
    altBinding?: string,
    refAttr?: string,
    staticImageUrl?: string,
): string {
    const { name, id } = node;

    const rawClassName = node.pluginData?.['className'];
    const cssClassName = rawClassName
        ? rawClassName
              .replace(/\{[^}]*\}/g, '')
              .trim()
              .replace(/\s+/g, ' ') || undefined
        : undefined;

    // Images inside CSS-styled containers should use responsive sizing
    // so they fill their parent and let CSS handle the layout. Hardcoded
    // pixel dimensions from Figma break responsive layouts.
    const borderRadius = getBorderRadius(node);
    const commonStyles = getCommonStyles(node);
    const effectiveStyle = cssClassName
        ? ''
        : `width: 100%; height: 100%; object-fit: cover;${borderRadius}${commonStyles}`.trim();

    let src = '';
    if (srcBinding) {
        src = srcBinding;
    } else if (staticImageUrl) {
        src = staticImageUrl;
    } else {
        src = '/placeholder-image.png';
        console.warn(`Image node "${name}" (${id}) has no src binding or static image`);
    }

    const alt = altBinding || name;

    const classAttr = cssClassName ? ` class="${cssClassName}"` : '';
    const refAttribute = refAttr || '';
    const styleAttribute = effectiveStyle ? ` style="${effectiveStyle}"` : '';
    const dataAttribute = ` data-jay-node-id="${id}"`;

    return `${indent}<img${classAttr}${dataAttribute}${refAttribute} src="${src}" alt="${alt}"${styleAttribute} />\n`;
}

export function extractStaticImageUrl(node: FigmaVendorDocument): string | undefined {
    if (!node.fills || !Array.isArray(node.fills)) {
        return undefined;
    }

    for (const fill of node.fills) {
        if (fill.visible !== false && fill.type === 'IMAGE') {
            if (fill.imageUrl) {
                return fill.imageUrl;
            }
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
