import { describe, it, expect, vi } from 'vitest';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import { convertVariantNode } from '../../../lib/vendors/figma/converters/variants';
import type { BindingAnalysis, ConversionContext } from '../../../lib/vendors/figma/types';
import { JAY_OVERLAY_PLUGIN_KEY } from '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc';

describe('DL-108 overlay export (convertVariantNode)', () => {
    const baseContext: ConversionContext = {
        repeaterPathStack: [],
        indentLevel: 0,
        fontFamilies: new Set(),
        projectPage: {},
        plugins: [],
    };

    const analysis: BindingAnalysis = {
        type: 'property-variant',
        attributes: new Map(),
        isRepeater: false,
        propertyBindings: [
            {
                property: 'isSearching',
                tagPath: 'productSearch.isSearching',
                contractTag: { tag: 'isSearching', type: 'field', dataType: 'boolean' } as any,
            },
        ],
    };

    it('emits position: fixed; inset: 0 on if wrapper when INSTANCE has jay-overlay=fixed', () => {
        const instance: FigmaVendorDocument = {
            id: 'i1',
            name: 'variants',
            type: 'INSTANCE',
            pluginData: { [JAY_OVERLAY_PLUGIN_KEY]: 'fixed' },
            mainComponentId: 'set1',
        };

        const variantComp: FigmaVendorDocument = {
            id: 'c1',
            name: 'isSearching=true',
            type: 'COMPONENT',
            variantProperties: { isSearching: 'true' },
            children: [
                {
                    id: 'inner',
                    name: 'div',
                    type: 'FRAME',
                    width: 100,
                    height: 50,
                },
            ],
        };

        const componentSet: FigmaVendorDocument = {
            id: 'set1',
            name: 'set',
            type: 'COMPONENT_SET',
            children: [variantComp],
            componentPropertyDefinitions: {
                isSearching: { type: 'VARIANT', variantOptions: ['true', 'false'] },
            },
        };

        const componentSetIndex = new Map<string, FigmaVendorDocument>([['set1', componentSet]]);

        const html = convertVariantNode(
            instance,
            analysis,
            { ...baseContext, componentSetIndex },
            vi.fn(() => ''),
        );

        expect(html).toContain('if="productSearch.isSearching"');
        expect(html).toContain('position: fixed; inset: 0;');
    });
});
