import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

/**
 * Utility functions for converting Figma properties to CSS styles.
 * These mirror the functions from the old plugin's utils.ts but work with serialized data.
 */

/**
 * Calculates the position type for a node based on its layout context
 */
function getPositionType(node: FigmaVendorDocument): 'absolute' | 'fixed' | 'static' | 'relative' | 'sticky' {
    // If node has explicit absolute positioning
    if (node.layoutPositioning === 'ABSOLUTE') {
        return 'absolute';
    }

    // Check for scroll-related positioning
    if (node.parentOverflowDirection && node.parentOverflowDirection !== 'NONE') {
        // Check if this node should be fixed during scroll
        if (node.parentNumberOfFixedChildren && node.parentChildIndex !== undefined) {
            if (node.parentChildIndex >= 0 && node.parentChildIndex < node.parentNumberOfFixedChildren) {
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
                } else {
                    styles += 'width: 100%;';
                }
                break;
        }
    } else {
        // Fallback: use fixed dimensions
        styles += `width: ${width}px;`;
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
                styles += 'height: 100%;';
                break;
        }
    } else {
        // Fallback: use fixed dimensions
        styles += `height: ${height}px;`;
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
        const visibleEffects = node.effects
            .filter(e => e.visible !== false)
            .reverse();

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
                        boxShadows.push(`${inset}${offset.x}px ${offset.y}px ${radius}px ${spread ?? 0}px ${shadowColor}`);
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

