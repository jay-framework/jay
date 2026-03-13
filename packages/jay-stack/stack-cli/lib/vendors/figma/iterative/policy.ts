import type { PropertyClass, MergeDecision } from '@jay-framework/editor-protocol';

// ─── Property Classification ─────────────────────────────────────
// Encodes the locked PM/UX decisions from the execution plan.

const VISUAL_PROPERTIES = new Set([
    'fill', 'fills', 'stroke', 'strokes', 'opacity', 'effects',
    'backgroundColor', 'color', 'background', 'border', 'borderColor',
    'borderRadius', 'boxShadow', 'shadow', 'gradient', 'backgroundImage',
    'textDecoration', 'fontStyle',
]);

const LAYOUT_PROPERTIES = new Set([
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'gap', 'layoutMode', 'layoutAlign', 'layoutGrow', 'layoutSizingHorizontal',
    'layoutSizingVertical', 'flexDirection', 'flexWrap', 'justifyContent',
    'alignItems', 'alignSelf', 'position', 'top', 'right', 'bottom', 'left',
    'display', 'overflow',
]);

const SEMANTIC_PROPERTIES = new Set([
    'characters', 'textContent', 'name',
    'jay-layer-bindings', 'jay-ref', 'jay-id',
    'ref', 'forEach', 'trackBy', 'if', 'condition',
    'src', 'href', 'alt', 'value', 'placeholder',
    'semanticHtml', 'tagName',
]);

export function classifyProperty(propertyName: string): PropertyClass {
    if (SEMANTIC_PROPERTIES.has(propertyName)) return 'semantic';
    if (LAYOUT_PROPERTIES.has(propertyName)) return 'layout';
    if (VISUAL_PROPERTIES.has(propertyName)) return 'visual';
    return 'visual';
}

export interface PropertyPolicy {
    propertyClass: PropertyClass;
    defaultBehavior: MergeDecision;
    overrideBehavior: MergeDecision;
}

export function getPropertyPolicy(propertyName: string): PropertyPolicy {
    const cls = classifyProperty(propertyName);

    switch (cls) {
        case 'visual':
            return {
                propertyClass: 'visual',
                defaultBehavior: 'preserveDesigner',
                overrideBehavior: 'applyIncoming',
            };
        case 'layout':
            return {
                propertyClass: 'layout',
                defaultBehavior: 'applyIncoming',
                overrideBehavior: 'preserveDesigner',
            };
        case 'semantic':
            return {
                propertyClass: 'semantic',
                defaultBehavior: 'applyIncoming',
                overrideBehavior: 'preserveDesigner',
            };
    }
}
