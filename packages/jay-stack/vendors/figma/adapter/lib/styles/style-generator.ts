import {
    InterchangeNode,
    InterchangeFrame,
    InterchangeText,
    InterchangeInput,
    InterchangeFileUpload,
    JayPseudoStyles,
} from '@jay-framework/figma-interchange';

export function generateStyles(node: InterchangeNode, usedFontFamilies: Set<string>): string {
    const styles: string[] = [];

    // Position
    const positionStyle = getPositionStyle(node);
    if (positionStyle) styles.push(positionStyle);

    // Size
    const sizeStyle = getSizeStyle(node);
    if (sizeStyle) styles.push(sizeStyle);

    // Min/Max Constraints
    const minMaxStyle = getMinMaxConstraintStyles(node);
    if (minMaxStyle) styles.push(minMaxStyle);

    // Scrolling & Overflow
    const overflowStyle = getOverflowStyles(node);
    if (overflowStyle) styles.push(overflowStyle);

    // Common styles (opacity, rotation, effects)
    const commonStyle = getCommonStyles(node);
    if (commonStyle) styles.push(commonStyle);

    // Background fills
    const fillStyle = getBackgroundFillsStyle(node);
    if (fillStyle) styles.push(fillStyle);

    // Strokes/borders
    const strokeStyle = getStrokeStyles(node);
    if (strokeStyle) styles.push(strokeStyle);

    // Border radius for rectangles and frames
    const borderRadius = getBorderRadius(node);
    if (borderRadius) styles.push(borderRadius);

    // Auto-layout styles for frames
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        const autoLayoutStyle = getAutoLayoutStyles(node as InterchangeFrame);
        if (autoLayoutStyle) styles.push(autoLayoutStyle);
    }

    // Text Styles
    if (node.type === 'TEXT') {
        const textStyle = getTextStyles(node as InterchangeText, usedFontFamilies);
        if (textStyle) styles.push(textStyle);
    }

    // Font styles for input fields
    if (node.type === 'INPUT') {
        const fontStyle = getInputFontStyles(node as InterchangeInput);
        if (fontStyle) styles.push(fontStyle);
    }

    return styles.filter((s) => s.trim()).join('; ');
}

export function getPositionStyle(node: InterchangeNode): string {
    // For now, use absolute positioning for non-auto-layout children
    return `position: absolute; top: ${node.y}px; left: ${node.x}px`;
}

export function getSizeStyle(node: InterchangeNode): string {
    const styles: string[] = [];

    // Cast to any to access layout props safely if they exist
    const layoutNode = node as any;

    // Horizontal Sizing
    if (layoutNode.layoutSizingHorizontal === 'HUG') {
        styles.push('width: fit-content');
    } else if (layoutNode.layoutSizingHorizontal === 'FILL') {
        styles.push('width: 100%');
    } else {
        styles.push(`width: ${node.width}px`);
    }

    // Vertical Sizing
    if (layoutNode.layoutSizingVertical === 'HUG') {
        styles.push('height: fit-content');
    } else if (layoutNode.layoutSizingVertical === 'FILL') {
        styles.push('height: 100%');
    } else {
        styles.push(`height: ${node.height}px`);
    }

    return styles.join('; ');
}

export function getMinMaxConstraintStyles(node: InterchangeNode): string {
    const styles: string[] = [];
    const layoutNode = node as any; // Using any to access potential props

    if (layoutNode.minWidth !== undefined) styles.push(`min-width: ${layoutNode.minWidth}px`);
    if (layoutNode.maxWidth !== undefined) styles.push(`max-width: ${layoutNode.maxWidth}px`);
    if (layoutNode.minHeight !== undefined) styles.push(`min-height: ${layoutNode.minHeight}px`);
    if (layoutNode.maxHeight !== undefined) styles.push(`max-height: ${layoutNode.maxHeight}px`);

    return styles.join('; ');
}

export function getOverflowStyles(node: InterchangeNode): string {
    const layoutNode = node as any;
    if (!layoutNode.overflowDirection || layoutNode.overflowDirection === 'NONE') {
        return '';
    }

    if (layoutNode.overflowDirection === 'BOTH') {
        return 'overflow: auto';
    } else if (layoutNode.overflowDirection === 'HORIZONTAL') {
        return 'overflow-x: auto; overflow-y: hidden';
    } else if (layoutNode.overflowDirection === 'VERTICAL') {
        return 'overflow-y: auto; overflow-x: hidden';
    }
    return '';
}

export function getCommonStyles(node: InterchangeNode): string {
    const styles: string[] = [];

    // Opacity
    if (node.opacity !== undefined && node.opacity < 1) {
        styles.push(`opacity: ${node.opacity}`);
    }

    // Rotation
    if (node.rotation !== undefined && node.rotation !== 0) {
        styles.push(`transform: rotate(${node.rotation}deg)`);
        styles.push(`transform-origin: ${node.width / 2}px ${node.height / 2}px`);
    }

    // Effects (shadows, blurs)
    if (node.effects && node.effects.length > 0) {
        const effectStyles = generateEffectStyles(node.effects);
        if (effectStyles) styles.push(effectStyles);
    }

    return styles.join('; ');
}

export function generateEffectStyles(effects: any[]): string {
    const boxShadows: string[] = [];
    const filters: string[] = [];

    for (const effect of effects) {
        if (!effect.visible) continue;

        switch (effect.type) {
            case 'DROP_SHADOW':
            case 'INNER_SHADOW':
                const { offset, radius, color, spread } = effect;
                const shadowColor = `rgba(${Math.round((color?.r || 0) * 255)}, ${Math.round((color?.g || 0) * 255)}, ${Math.round((color?.b || 0) * 255)}, ${color?.a || 1})`;
                const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
                boxShadows.push(
                    `${inset}${offset?.x || 0}px ${offset?.y || 0}px ${radius}px ${spread || 0}px ${shadowColor}`,
                );
                break;
            case 'LAYER_BLUR':
                filters.push(`blur(${radius}px)`);
                break;
            case 'BACKGROUND_BLUR':
                // backdrop-filter requires special handling
                break;
        }
    }

    const result: string[] = [];
    if (boxShadows.length > 0) {
        result.push(`box-shadow: ${boxShadows.join(', ')}`);
    }
    if (filters.length > 0) {
        result.push(`filter: ${filters.join(' ')}`);
    }
    return result.join('; ');
}

export function getBackgroundFillsStyle(node: InterchangeNode): string {
    if (!node.fills || node.fills.length === 0) {
        return '';
    }

    const visibleFills = node.fills.filter((f) => f.visible !== false);
    if (visibleFills.length === 0) return '';

    // For simplicity, handle only the first solid fill
    const solidFill = visibleFills.find((f) => f.type === 'SOLID');
    if (solidFill && solidFill.color) {
        const { r, g, b } = solidFill.color;
        const opacity = solidFill.opacity ?? 1;
        const alpha = opacity < 1 ? opacity : 1;

        if (alpha < 1) {
            const alphaHex = Math.round(alpha * 255)
                .toString(16)
                .padStart(2, '0');
            return `background-color: #${Math.round(r * 255)
                .toString(16)
                .padStart(2, '0')}${Math.round(g * 255)
                .toString(16)
                .padStart(2, '0')}${Math.round(b * 255)
                .toString(16)
                .padStart(2, '0')}${alphaHex}`;
        } else {
            return `background-color: #${Math.round(r * 255)
                .toString(16)
                .padStart(2, '0')}${Math.round(g * 255)
                .toString(16)
                .padStart(2, '0')}${Math.round(b * 255)
                .toString(16)
                .padStart(2, '0')}`;
        }
    }

    return '';
}

export function getStrokeStyles(node: InterchangeNode): string {
    if (!node.strokes || node.strokes.length === 0) return '';

    const visibleStrokes = node.strokes.filter((s) => s.visible !== false);
    if (visibleStrokes.length === 0) return '';

    const stroke = visibleStrokes[0];
    if (stroke.type === 'SOLID' && stroke.color) {
        const { r, g, b } = stroke.color;
        const opacity = stroke.opacity ?? 1;
        const color =
            opacity < 1
                ? `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`
                : `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

        // Default to 1px if no weight specified
        return `border: 1px solid ${color}`;
    }

    return '';
}

export function getBorderRadius(node: InterchangeNode | InterchangeFileUpload): string {
    // Ellipses always have 50% border radius
    if (node.type === 'ELLIPSE') {
        return 'border-radius: 50%';
    }

    // Only rectangles, frames, images, inputs, and file uploads can have border radius
    if (
        node.type === 'RECTANGLE' ||
        node.type === 'FRAME' ||
        node.type === 'IMAGE' ||
        node.type === 'INPUT' ||
        node.type === 'FILE_UPLOAD'
    ) {
        const nodeWithRadius = node as any;
        if (nodeWithRadius.cornerRadius !== undefined) {
            if (typeof nodeWithRadius.cornerRadius === 'number') {
                return `border-radius: ${nodeWithRadius.cornerRadius}px`;
            } else if (typeof nodeWithRadius.cornerRadius === 'object') {
                const { topLeft, topRight, bottomRight, bottomLeft } = nodeWithRadius.cornerRadius;
                return `border-radius: ${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
            }
        }
    }
    return '';
}

export function getAutoLayoutStyles(frame: InterchangeFrame): string {
    if (frame.layoutMode === 'NONE') {
        return '';
    }

    const styles: string[] = ['display: flex'];

    // Direction
    if (frame.layoutMode === 'HORIZONTAL') {
        styles.push('flex-direction: row');
    } else if (frame.layoutMode === 'VERTICAL') {
        styles.push('flex-direction: column');
    }

    // Gap
    if (frame.itemSpacing) {
        styles.push(`gap: ${frame.itemSpacing}px`);
    }

    // Padding
    if (frame.paddingLeft) styles.push(`padding-left: ${frame.paddingLeft}px`);
    if (frame.paddingRight) styles.push(`padding-right: ${frame.paddingRight}px`);
    if (frame.paddingTop) styles.push(`padding-top: ${frame.paddingTop}px`);
    if (frame.paddingBottom) styles.push(`padding-bottom: ${frame.paddingBottom}px`);

    // Alignment
    // Map Primary Axis -> justify-content
    switch (frame.primaryAxisAlignItems) {
        case 'MIN':
            styles.push('justify-content: flex-start');
            break;
        case 'MAX':
            styles.push('justify-content: flex-end');
            break;
        case 'CENTER':
            styles.push('justify-content: center');
            break;
        case 'SPACE_BETWEEN':
            styles.push('justify-content: space-between');
            break;
        default:
            // Default to flex-start if undefined
            // styles.push('justify-content: flex-start');
            break;
    }

    // Map Counter Axis -> align-items
    switch (frame.counterAxisAlignItems) {
        case 'MIN':
            styles.push('align-items: flex-start');
            break;
        case 'MAX':
            styles.push('align-items: flex-end');
            break;
        case 'CENTER':
            styles.push('align-items: center');
            break;
        case 'BASELINE':
            styles.push('align-items: baseline');
            break;
        default:
            // Default?
            break;
    }

    return styles.join('; ');
}

export function getInputFontStyles(input: InterchangeInput): string {
    const styles: string[] = [];

    if (input.fontFamily) {
        styles.push(`font-family: '${input.fontFamily}', sans-serif`);
    }
    if (input.fontSize) {
        styles.push(`font-size: ${input.fontSize}px`);
    }
    if (input.fontWeight) {
        styles.push(`font-weight: ${input.fontWeight}`);
    }
    if (input.textColor) {
        styles.push(`color: ${input.textColor}`);
    }
    if (input.letterSpacing) {
        styles.push(`letter-spacing: ${input.letterSpacing}`);
    }
    if (input.lineHeight) {
        styles.push(`line-height: ${input.lineHeight}`);
    }
    if (input.textAlign) {
        styles.push(`text-align: ${input.textAlign}`);
    }

    return styles.join('; ');
}

export function getTextStyles(node: InterchangeText, usedFontFamilies: Set<string>): string {
    const styles: string[] = [];

    // Font Family
    if (node.fontFamily) {
        styles.push(`font-family: '${node.fontFamily}', sans-serif`);
        usedFontFamilies.add(node.fontFamily);
    }

    // Font Size
    if (node.fontSize) {
        styles.push(`font-size: ${node.fontSize}px`);
    }

    // Font Weight
    if (node.fontWeight) {
        styles.push(`font-weight: ${node.fontWeight}`);
    }

    // Letter Spacing
    if (node.letterSpacing !== undefined) {
        if (typeof node.letterSpacing === 'number') {
            // Figma letterSpacing as number is often pixels if very small, or percent?
            // Actually Figma API says letterSpacing is object {value, unit}.
            // But our interface said number | string.
            // If it's a number, assume px for now (safe bet in CSS if we append px, or em if small).
            // Let's assume px if absolute number.
            styles.push(`letter-spacing: ${node.letterSpacing}px`);
        } else {
            styles.push(`letter-spacing: ${node.letterSpacing}`);
        }
    }

    // Line Height
    if (node.lineHeight !== undefined) {
        if (typeof node.lineHeight === 'number') {
            styles.push(`line-height: ${node.lineHeight}px`);
        } else if (typeof node.lineHeight === 'string') {
            styles.push(`line-height: ${node.lineHeight}`);
        } else if (typeof node.lineHeight === 'object') {
            const { value, unit } = node.lineHeight;
            if (unit === 'PIXELS') {
                styles.push(`line-height: ${value}px`);
            } else if (unit === 'PERCENT') {
                styles.push(`line-height: ${value}%`);
            } else if (unit === 'AUTO') {
                styles.push('line-height: normal');
            }
        }
    }

    // Text Align
    if (node.textAlignHorizontal) {
        switch (node.textAlignHorizontal) {
            case 'LEFT':
                styles.push('text-align: left');
                break;
            case 'CENTER':
                styles.push('text-align: center');
                break;
            case 'RIGHT':
                styles.push('text-align: right');
                break;
            case 'JUSTIFIED':
                styles.push('text-align: justify');
                break;
        }
    }

    // Vertical Align (CSS doesn't support this easily on text blocks without flex/display table)
    // If we wanted to support it, we'd need the container to be flex.
    // Or using line-height tricks.
    // For now, let's ignore vertical align on text node itself unless it's a flex item.
    // Actually, if it is a flex item, align-self might work but text-align-vertical is internal to the text box.
    // In web, display: flex; align-items: ... on the text wrapper.
    if (node.textAlignVertical) {
        styles.push('display: flex');
        if (node.textAlignVertical === 'TOP') styles.push('align-items: flex-start');
        if (node.textAlignVertical === 'CENTER') styles.push('align-items: center');
        if (node.textAlignVertical === 'BOTTOM') styles.push('align-items: flex-end');
    }

    // Text Decoration
    if (node.textDecoration) {
        if (node.textDecoration === 'UNDERLINE') styles.push('text-decoration: underline');
        if (node.textDecoration === 'STRIKETHROUGH') styles.push('text-decoration: line-through');
    }

    // Color (from fills)
    if (node.fills && node.fills.length > 0) {
        const visibleFills = node.fills.filter((f) => f.visible !== false);
        const solidFill = visibleFills.find((f) => f.type === 'SOLID');
        if (solidFill && solidFill.color) {
            const { r, g, b } = solidFill.color;
            const opacity = solidFill.opacity ?? 1;
            const alpha = opacity < 1 ? opacity : 1;

            if (alpha < 1) {
                styles.push(
                    `color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`,
                );
            } else {
                styles.push(
                    `color: rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`,
                );
            }
        }
    }

    return styles.join('; ');
}

export function generateFileUploadLabelStyles(node: InterchangeFileUpload): string {
    const styles: string[] = [];

    // Position
    const positionStyle = getPositionStyle(node);
    if (positionStyle) styles.push(positionStyle);

    // Size
    const sizeStyle = getSizeStyle(node);
    if (sizeStyle) styles.push(sizeStyle);

    // Background fills
    const fillStyle = getBackgroundFillsStyle(node);
    if (fillStyle) styles.push(fillStyle);

    // Strokes/borders
    const strokeStyle = getStrokeStyles(node);
    if (strokeStyle) styles.push(strokeStyle);

    // Border radius
    const borderRadius = getBorderRadius(node);
    if (borderRadius) styles.push(borderRadius);

    // Common styles (opacity, rotation, effects)
    const commonStyle = getCommonStyles(node);
    if (commonStyle) styles.push(commonStyle);

    // Font styles
    const fontStyle = getFileUploadFontStyles(node);
    if (fontStyle) styles.push(fontStyle);

    // Additional styles for file upload button
    styles.push('cursor: pointer');
    styles.push('display: flex');
    styles.push('align-items: center');
    styles.push('justify-content: center');
    styles.push('box-sizing: border-box');

    return styles.filter((s) => s.trim()).join('; ');
}

export function getFileUploadFontStyles(upload: InterchangeFileUpload): string {
    const styles: string[] = [];

    if (upload.fontFamily) {
        styles.push(`font-family: '${upload.fontFamily}', sans-serif`);
    }
    if (upload.fontSize) {
        styles.push(`font-size: ${upload.fontSize}px`);
    }
    if (upload.fontWeight) {
        styles.push(`font-weight: ${upload.fontWeight}`);
    }
    if (upload.textColor) {
        styles.push(`color: ${upload.textColor}`);
    }
    if (upload.letterSpacing) {
        styles.push(`letter-spacing: ${upload.letterSpacing}`);
    }
    if (upload.lineHeight) {
        styles.push(`line-height: ${upload.lineHeight}`);
    }
    if (upload.textAlign) {
        styles.push(`text-align: ${upload.textAlign}`);
    }

    return styles.join('; ');
}

export function generatePseudoClassStyles(
    className: string,
    pseudoStyles: JayPseudoStyles,
    syntheticTags: Set<string>,
) {
    // Supported pseudo-states
    const states = ['hover', 'active', 'focus'];

    states.forEach((state) => {
        const styles = pseudoStyles[state as keyof JayPseudoStyles];
        if (styles) {
            const rules = Object.entries(styles)
                .map(([prop, value]) => `${prop}: ${value}`)
                .join('; ');

            if (rules) {
                syntheticTags.add(`.${className}:${state} { ${rules} }`);
            }
        }
    });
}
