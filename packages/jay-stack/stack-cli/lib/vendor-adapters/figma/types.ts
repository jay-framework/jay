/**
 * Figma-specific types
 *
 * This file defines the shape of the Figma document that will be sent
 * from the Figma plugin to the dev server.
 *
 * NOTE: This is a placeholder/example structure. The actual Figma plugin
 * should define and maintain these types based on what it serializes.
 */

/**
 * Example Figma document structure
 * The Figma plugin will serialize its design into this format
 */
export interface FigmaDoc {
    /** The name of the page/frame being exported */
    name: string;

    /** The Figma node ID */
    nodeId: string;

    /** Figma node type */
    type: string;

    /** Child nodes */
    children?: FigmaDoc[];

    /** Layout properties (AutoLayout, etc.) */
    layout?: {
        mode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
        primaryAxisSizing?: 'FIXED' | 'AUTO';
        counterAxisSizing?: 'FIXED' | 'AUTO';
        paddingLeft?: number;
        paddingRight?: number;
        paddingTop?: number;
        paddingBottom?: number;
        itemSpacing?: number;
    };

    /** Style properties */
    style?: {
        backgroundColor?: string;
        fills?: any[];
        strokes?: any[];
        effects?: any[];
    };

    /** Text content (for text nodes) */
    characters?: string;

    /** Size and position */
    absoluteBoundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };

    /** Component properties (for instances) */
    componentProperties?: Record<string, any>;

    /** Additional metadata */
    metadata?: Record<string, any>;
}
