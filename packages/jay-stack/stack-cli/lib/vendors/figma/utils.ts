import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

/**
 * Utility functions for converting Figma properties to CSS styles.
 * These mirror the functions from the old plugin's utils.ts but work with serialized data.
 */

/**
 * Converts RGB color object to hex string with optional alpha
 */
export function rgbToHex(color: { r: number; g: number; b: number }, opacity?: number): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    if (opacity !== undefined && opacity < 1) {
        const alphaHex = Math.round(opacity * 255)
            .toString(16)
            .padStart(2, '0');
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${alphaHex}`;
    } else {
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
}

/**
 * Calculates the position type for a node based on its layout context
 */
function getPositionType(
    node: FigmaVendorDocument,
): 'absolute' | 'fixed' | 'static' | 'relative' | 'sticky' {
    // If node has explicit absolute positioning
    if (node.layoutPositioning === 'ABSOLUTE') {
        return 'absolute';
    }

    // Check for scroll-related positioning
    if (node.parentOverflowDirection && node.parentOverflowDirection !== 'NONE') {
        // Check if this node should be fixed during scroll
        if (node.parentNumberOfFixedChildren && node.parentChildIndex !== undefined) {
            if (
                node.parentChildIndex >= 0 &&
                node.parentChildIndex < node.parentNumberOfFixedChildren
            ) {
                return 'sticky';
            }
        }
    }

    // If node has fixed scroll behavior and parent is not auto layout
    if (node.scrollBehavior === 'FIXED' && node.parentLayoutMode === 'NONE') {
        return 'fixed';
    }

    // If node is a direct child of a SECTION (top level frame)
    if (node.parentType === 'SECTION') {
        return 'absolute';
    }

    // If parent is not an auto layout frame, use absolute positioning
    if (node.parentLayoutMode === 'NONE') {
        return 'absolute';
    }

    // For nodes in auto-layout parents, use relative positioning
    if (node.parentLayoutMode && node.parentLayoutMode !== 'NONE') {
        return 'relative';
    }

    return 'static';
}

/**
 * Gets the position style for a node
 */
export function getPositionStyle(node: FigmaVendorDocument): string {
    if (node.type === 'COMPONENT') {
        return '';
    }

    const positionType = getPositionType(node);
    if (positionType === 'static') {
        return ''; // Empty string for flex layout
    }

    // Only include top/left for absolute or fixed positioning
    if (positionType === 'absolute' || positionType === 'fixed') {
        const top = node.y !== undefined ? node.y : 0;
        const left = node.x !== undefined ? node.x : 0;
        return `position: ${positionType};top: ${top}px;left: ${left}px;`;
    }

    // For sticky positioning, include top position and z-index
    if (positionType === 'sticky') {
        return `position: ${positionType};top: 0;z-index: 10;`;
    }

    // For relative positioning, just return the position type
    return `position: ${positionType};`;
}

/**
 * Gets size styles for auto-layout children
 */
function getAutoLayoutChildSizeStyles(node: FigmaVendorDocument): string {
    // Check if parent is an auto layout container
    if (!node.parentLayoutMode || node.parentLayoutMode === 'NONE') {
        // Not in auto layout, use fixed dimensions
        const width = node.width !== undefined ? node.width : 0;
        const height = node.height !== undefined ? node.height : 0;
        return `width: ${width}px;height: ${height}px;`;
    }

    let styles = '';

    // Check if node has auto layout child properties
    if (!node.layoutGrow && !node.layoutAlign) {
        // Node doesn't have auto layout properties, use fixed dimensions
        const width = node.width !== undefined ? node.width : 0;
        const height = node.height !== undefined ? node.height : 0;
        return `width: ${width}px;height: ${height}px;`;
    }

    const isHorizontalLayout = node.parentLayoutMode === 'HORIZONTAL';
    const width = node.width !== undefined ? node.width : 0;
    const height = node.height !== undefined ? node.height : 0;

    // Handle horizontal sizing (width)
    if (node.layoutSizingHorizontal) {
        // Use modern API if available
        switch (node.layoutSizingHorizontal) {
            case 'FIXED':
                styles += `width: ${width}px;`;
                break;
            case 'HUG':
                styles += 'width: fit-content;';
                break;
            case 'FILL':
                if (node.type === 'TEXT') {
                    styles += 'width: auto;';
                } else if (isHorizontalLayout) {
                    // Fill on main axis (horizontal) - use flex-grow
                    styles += 'flex-grow: 1;';
                } else {
                    // Fill on counter axis (parent is vertical) - use 100%
                    styles += 'width: 100%;';
                }
                break;
        }
    } else {
        // Fallback to legacy properties for horizontal sizing
        if (isHorizontalLayout && node.layoutGrow && node.layoutGrow > 0) {
            // Fill on main axis (horizontal)
            styles += `flex-grow: ${node.layoutGrow};width: 0;`;
        } else if (!isHorizontalLayout && node.layoutAlign === 'STRETCH') {
            // Stretch on counter axis
            styles += 'width: 100%;';
        } else {
            // Fixed width
            styles += `width: ${width}px;`;
        }
    }

    // Handle vertical sizing (height)
    if (node.layoutSizingVertical) {
        // Use modern API if available
        switch (node.layoutSizingVertical) {
            case 'FIXED':
                styles += `height: ${height}px;`;
                break;
            case 'HUG':
                styles += 'height: fit-content;';
                break;
            case 'FILL':
                if (!isHorizontalLayout) {
                    // Fill on main axis (vertical) - use flex-grow
                    styles += 'flex-grow: 1;';
                } else {
                    // Fill on counter axis (parent is horizontal) - use 100%
                    styles += 'height: 100%;';
                }
                break;
        }
    } else {
        // Fallback to legacy properties for vertical sizing
        if (!isHorizontalLayout && node.layoutGrow && node.layoutGrow > 0) {
            // Fill on main axis (vertical)
            styles += `flex-grow: ${node.layoutGrow};height: 0;`;
        } else if (isHorizontalLayout && node.layoutAlign === 'STRETCH') {
            // Stretch on counter axis
            styles += 'height: 100%;';
        } else {
            // Fixed height
            styles += `height: ${height}px;`;
        }
    }

    // Handle align-self for cross axis alignment
    if (node.layoutAlign && node.layoutAlign !== 'INHERIT') {
        switch (node.layoutAlign) {
            case 'MIN':
                styles += 'align-self: flex-start;';
                break;
            case 'CENTER':
                styles += 'align-self: center;';
                break;
            case 'MAX':
                styles += 'align-self: flex-end;';
                break;
            case 'STRETCH':
                styles += 'align-self: stretch;';
                break;
        }
    }

    return styles;
}

/**
 * Gets size styles for any node
 */
export function getNodeSizeStyles(node: FigmaVendorDocument): string {
    // Skip first frame that is child of a SECTION node
    if (node.parentType === 'SECTION') {
        const height = node.height !== undefined ? node.height : 0;
        return `width: 100%;height: ${height}px;`;
    }

    return getAutoLayoutChildSizeStyles(node);
}

/**
 * Gets common styles like opacity, rotation, effects
 * Mirrors the logic from the old plugin's getCommonStyles function
 */
export function getCommonStyles(node: FigmaVendorDocument): string {
    let styles = '';
    const transformStyles: string[] = []; // Collect transform functions

    // Opacity
    if (node.opacity !== undefined && node.opacity < 1) {
        styles += `opacity: ${node.opacity};`;
    }

    // Rotation
    if (node.rotation !== undefined && node.rotation !== 0) {
        // Figma rotation is clockwise, CSS is clockwise
        transformStyles.push(`rotate(${node.rotation}deg)`);
    }

    // Handle potential scale/flip (if export settings preserve them)
    // if ('scale' in node...) { transformStyles.push(`scale(${node.scaleX}, ${node.scaleY})`) }

    // --- Effects ---
    if (node.effects && Array.isArray(node.effects) && node.effects.length > 0) {
        // Process effects in reverse order for CSS (like Figma layers)
        // Only process visible effects (visible !== false)
        const visibleEffects = node.effects.filter((e) => e.visible !== false).reverse();

        const filterFunctions: string[] = [];
        const boxShadows: string[] = [];

        for (const effect of visibleEffects) {
            switch (effect.type) {
                case 'DROP_SHADOW':
                case 'INNER_SHADOW': {
                    if (effect.color && effect.offset && effect.radius !== undefined) {
                        const { offset, radius, color, spread } = effect;
                        const shadowColor = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a ?? 1})`;
                        const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
                        // CSS: h-offset v-offset blur spread color
                        boxShadows.push(
                            `${inset}${offset.x}px ${offset.y}px ${radius}px ${spread ?? 0}px ${shadowColor}`,
                        );
                    }
                    break;
                }
                case 'LAYER_BLUR':
                    if (effect.radius !== undefined) {
                        filterFunctions.push(`blur(${effect.radius}px)`);
                    }
                    break;
                case 'BACKGROUND_BLUR':
                    // Requires backdrop-filter, might need specific stacking context
                    if (effect.radius !== undefined) {
                        styles += `backdrop-filter: blur(${effect.radius}px);`;
                        // Need -webkit-backdrop-filter: blur(...) for Safari etc.
                        styles += `-webkit-backdrop-filter: blur(${effect.radius}px);`;
                    }
                    break;
                // Add other effect types if needed
            }
        }

        if (boxShadows.length > 0) {
            // Multiple box shadows are comma-separated
            styles += `box-shadow: ${boxShadows.join(', ')};`;
        }
        if (filterFunctions.length > 0) {
            // Multiple filters are space-separated
            styles += `filter: ${filterFunctions.join(' ')};`;
        }
    }

    // --- Apply Transforms ---
    if (transformStyles.length > 0) {
        // Combine multiple transforms
        styles += `transform: ${transformStyles.join(' ')};`;
        // Consider setting transform-origin, especially if rotation/scaling occurs
        // Origin is node's top-left in Figma's model before rotation.
        // CSS default is '50% 50%'. To match Figma's visual if rotated around top-left:
        // styles += 'transform-origin: 0 0;';
        // Or around center:
        const width = node.width !== undefined ? node.width : 0;
        const height = node.height !== undefined ? node.height : 0;
        styles += `transform-origin: ${width / 2}px ${height / 2}px;`;
    }

    return styles;
}

/**
 * Gets border radius styles for a Frame
 */
export function getBorderRadius(node: FigmaVendorDocument): string {
    if (typeof node.cornerRadius === 'number') {
        return `border-radius: ${node.cornerRadius}px;`;
    } else if (node.cornerRadius === 'MIXED' && node.topLeftRadius !== undefined) {
        return `border-radius: ${node.topLeftRadius}px ${node.topRightRadius}px ${node.bottomRightRadius}px ${node.bottomLeftRadius}px;`;
    }
    return 'border-radius: 0px;';
}

/**
 * Gets auto-layout (flexbox) styles for a Frame
 */
export function getAutoLayoutStyles(node: FigmaVendorDocument): string {
    if (node.layoutMode === 'NONE' || !node.layoutMode) {
        return '';
    }

    let flexStyles = 'display: flex;';

    // Set flex direction
    if (node.layoutMode === 'HORIZONTAL') {
        flexStyles += 'flex-direction: row;';
    } else if (node.layoutMode === 'VERTICAL') {
        flexStyles += 'flex-direction: column;';
    }

    // Set primary axis alignment
    if (node.primaryAxisAlignItems) {
        switch (node.primaryAxisAlignItems) {
            case 'MIN':
                flexStyles += 'justify-content: flex-start;';
                break;
            case 'CENTER':
                flexStyles += 'justify-content: center;';
                break;
            case 'MAX':
                flexStyles += 'justify-content: flex-end;';
                break;
            case 'SPACE_BETWEEN':
                flexStyles += 'justify-content: space-between;';
                break;
        }
    }

    // Set counter axis alignment
    if (node.counterAxisAlignItems) {
        switch (node.counterAxisAlignItems) {
            case 'MIN':
                flexStyles += 'align-items: flex-start;';
                break;
            case 'CENTER':
                flexStyles += 'align-items: center;';
                break;
            case 'MAX':
                flexStyles += 'align-items: flex-end;';
                break;
        }
    }

    // Add gap if specified
    if (typeof node.itemSpacing === 'number') {
        flexStyles += `gap: ${node.itemSpacing}px;`;
    }

    // Add padding if specified
    if (typeof node.paddingLeft === 'number') flexStyles += `padding-left: ${node.paddingLeft}px;`;
    if (typeof node.paddingRight === 'number')
        flexStyles += `padding-right: ${node.paddingRight}px;`;
    if (typeof node.paddingTop === 'number') flexStyles += `padding-top: ${node.paddingTop}px;`;
    if (typeof node.paddingBottom === 'number')
        flexStyles += `padding-bottom: ${node.paddingBottom}px;`;

    return flexStyles;
}

/**
 * Gets overflow and clipping styles
 */
export function getOverflowStyles(node: FigmaVendorDocument): string {
    let overflowStyles = '';

    const shouldClip = node.clipsContent;
    const overflowDirection = node.overflowDirection || 'NONE';

    switch (overflowDirection) {
        case 'HORIZONTAL':
            overflowStyles += shouldClip
                ? 'overflow-x: auto; overflow-y: hidden;'
                : 'overflow-x: auto; overflow-y: visible;';
            break;
        case 'VERTICAL':
            overflowStyles += shouldClip
                ? 'overflow-x: hidden; overflow-y: auto;'
                : 'overflow-x: visible; overflow-y: auto;';
            break;
        case 'BOTH':
            overflowStyles += 'overflow: auto;';
            break;
        case 'NONE':
        default:
            overflowStyles += shouldClip ? 'overflow: hidden;' : 'overflow: visible;';
            break;
    }

    // Add Firefox scrollbar styling for better appearance
    if (overflowDirection !== 'NONE') {
        overflowStyles += 'scrollbar-width: thin; scrollbar-color: rgba(0, 0, 0, 0.3) transparent;';
    }

    return overflowStyles;
}

/**
 * Gets background fill styles (solid colors, gradients, images)
 */
export function getBackgroundFillsStyle(node: FigmaVendorDocument): string {
    if (!node.fills || !Array.isArray(node.fills) || node.fills.length === 0) {
        return 'background: transparent;';
    }

    const backgrounds: string[] = [];
    const backgroundSizes: string[] = [];
    const backgroundPositions: string[] = [];
    const backgroundRepeats: string[] = [];

    // Process fills in reverse order (bottom to top)
    for (const fill of [...node.fills].reverse()) {
        if (fill.visible === false) continue;

        if (fill.type === 'SOLID' && fill.color) {
            const { r, g, b } = fill.color;
            const opacity = fill.opacity !== undefined ? fill.opacity : 1;

            // Create a solid color layer using linear-gradient
            backgrounds.push(
                `linear-gradient(rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity}), rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity}))`,
            );
            backgroundSizes.push('100% 100%');
            backgroundPositions.push('center');
            backgroundRepeats.push('no-repeat');
        } else if (fill.type === 'IMAGE') {
            // TODO: Handle image fills - requires image export from plugin
            // For now, use a placeholder
            console.warn('Image fills are not yet supported in vendor conversion');
        }
    }

    if (backgrounds.length === 0) {
        return 'background: transparent;';
    }

    // Combine all background properties
    let style = `background-image: ${backgrounds.join(', ')};`;
    style += `background-size: ${backgroundSizes.join(', ')};`;
    style += `background-position: ${backgroundPositions.join(', ')};`;
    style += `background-repeat: ${backgroundRepeats.join(', ')};`;

    return style;
}

/**
 * Gets stroke (border) styles
 */
export function getStrokeStyles(node: FigmaVendorDocument): string {
    if (!node.strokes || node.strokes.length === 0) {
        return '';
    }

    // Only support visible strokes
    const visibleStrokes = node.strokes.filter((s: any) => s.visible !== false);
    if (visibleStrokes.length === 0) {
        return '';
    }

    // Figma supports multiple strokes, but CSS only supports one border. Use the first visible stroke.
    const stroke = visibleStrokes[0];
    let cssProps: string[] = [];

    // Handle stroke color (with alpha)
    if (stroke.type === 'SOLID' && stroke.color) {
        const r = Math.round(stroke.color.r * 255);
        const g = Math.round(stroke.color.g * 255);
        const b = Math.round(stroke.color.b * 255);
        const a = stroke.opacity !== undefined ? stroke.opacity : 1;
        if (a < 1) {
            cssProps.push(`border-color: rgba(${r}, ${g}, ${b}, ${a.toFixed(2)});`);
        } else {
            cssProps.push(`border-color: rgb(${r}, ${g}, ${b});`);
        }
    } else {
        // Only solid supported for HTML borders
        return '';
    }

    // Handle stroke width (per-side if available)
    const top =
        typeof node.strokeTopWeight === 'number'
            ? node.strokeTopWeight
            : typeof node.strokeWeight === 'number'
              ? node.strokeWeight
              : 0;
    const right =
        typeof node.strokeRightWeight === 'number'
            ? node.strokeRightWeight
            : typeof node.strokeWeight === 'number'
              ? node.strokeWeight
              : 0;
    const bottom =
        typeof node.strokeBottomWeight === 'number'
            ? node.strokeBottomWeight
            : typeof node.strokeWeight === 'number'
              ? node.strokeWeight
              : 0;
    const left =
        typeof node.strokeLeftWeight === 'number'
            ? node.strokeLeftWeight
            : typeof node.strokeWeight === 'number'
              ? node.strokeWeight
              : 0;

    if (top !== 0 || right !== 0 || bottom !== 0 || left !== 0) {
        // Check if all sides are equal
        if (top === right && right === bottom && bottom === left) {
            cssProps.push(`border-width: ${top}px;`);
        } else {
            cssProps.push(`border-width: ${top}px ${right}px ${bottom}px ${left}px;`);
        }

        // Handle dash pattern (dashed/solid)
        if (node.dashPattern && node.dashPattern.length > 0) {
            cssProps.push('border-style: dashed;');
        } else {
            cssProps.push('border-style: solid;');
        }
    }

    return cssProps.join(' ');
}

/**
 * Gets frame size styles (width/height based on layout mode)
 */
export function getFrameSizeStyles(node: FigmaVendorDocument): string {
    const isTopLevel = node.parentType === 'SECTION';

    // Top-level frames (direct children of SECTION)
    if (isTopLevel) {
        const height = node.height !== undefined ? node.height : 0;
        return `width: 100%;height: ${height}px;`;
    }

    // Non-auto-layout frames
    if (node.layoutMode === 'NONE' || !node.layoutMode) {
        const width = node.width !== undefined ? node.width : 0;
        const height = node.height !== undefined ? node.height : 0;
        return `width: ${width}px;height: ${height}px;`;
    }

    // Auto-layout frames
    let sizeStyles = '';
    const width = node.width !== undefined ? node.width : 0;
    const height = node.height !== undefined ? node.height : 0;

    // Determine width style
    if (node.layoutSizingHorizontal) {
        switch (node.layoutSizingHorizontal) {
            case 'FIXED':
                sizeStyles += `width: ${width}px;`;
                break;
            case 'HUG':
                sizeStyles += 'width: fit-content;';
                break;
            case 'FILL':
                sizeStyles += 'width: 100%;';
                break;
        }
    } else {
        sizeStyles += `width: ${width}px;`;
    }

    // Determine height style
    if (node.layoutSizingVertical) {
        switch (node.layoutSizingVertical) {
            case 'FIXED':
                sizeStyles += `height: ${height}px;`;
                break;
            case 'HUG':
                sizeStyles += 'height: fit-content;';
                break;
            case 'FILL':
                sizeStyles += 'height: 100%;';
                break;
        }
    } else {
        sizeStyles += `height: ${height}px;`;
    }

    // Add wrap constraint if needed
    if (node.layoutWrap === 'WRAP') {
        sizeStyles += `max-width: ${width}px;`;
    }

    return sizeStyles;
}
