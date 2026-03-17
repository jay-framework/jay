import { describe, it, expect } from 'vitest';
import {
    getPositionStyle,
    getOverflowStyles,
    getFrameSizeStyles,
} from '../../../lib/vendors/figma/utils';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

function makeNode(overrides: Partial<FigmaVendorDocument> = {}): FigmaVendorDocument {
    return {
        id: 'test-node',
        name: 'test',
        type: 'FRAME',
        ...overrides,
    };
}

describe('Variant content wrapper normalization (parentType=COMPONENT)', () => {
    describe('getPositionStyle', () => {
        it('should return empty for COMPONENT nodes', () => {
            const node = makeNode({ type: 'COMPONENT' });
            expect(getPositionStyle(node)).toBe('');
        });

        it('should return empty for direct children of COMPONENT nodes', () => {
            const node = makeNode({
                parentType: 'COMPONENT',
                layoutPositioning: 'ABSOLUTE',
                x: 0,
                y: 0,
            });
            expect(getPositionStyle(node)).toBe('');
        });

        it('should still emit position for non-COMPONENT parents', () => {
            const node = makeNode({
                parentType: 'FRAME',
                layoutPositioning: 'ABSOLUTE',
                x: 10,
                y: 20,
            });
            expect(getPositionStyle(node)).toContain('position: absolute');
        });
    });

    describe('getOverflowStyles', () => {
        it('should return empty for direct children of COMPONENT nodes', () => {
            const node = makeNode({
                parentType: 'COMPONENT',
                clipsContent: true,
                overflowDirection: 'NONE',
            });
            expect(getOverflowStyles(node)).toBe('');
        });

        it('should still emit overflow for non-COMPONENT parents', () => {
            const node = makeNode({
                parentType: 'FRAME',
                clipsContent: true,
            });
            expect(getOverflowStyles(node)).toContain('overflow: hidden');
        });
    });

    describe('getFrameSizeStyles', () => {
        it('should emit only width for COMPONENT children with valid dimensions', () => {
            const node = makeNode({
                parentType: 'COMPONENT',
                width: 960,
                height: 0.00009999,
            });
            expect(getFrameSizeStyles(node)).toBe('width: 960px;');
        });

        it('should emit only width even when height is non-zero', () => {
            const node = makeNode({
                parentType: 'COMPONENT',
                width: 960,
                height: 400,
            });
            expect(getFrameSizeStyles(node)).toBe('width: 960px;');
        });

        it('should return empty when width is zero or missing', () => {
            const node = makeNode({
                parentType: 'COMPONENT',
                width: 0,
                height: 100,
            });
            expect(getFrameSizeStyles(node)).toBe('');
        });

        it('should emit full dimensions for non-COMPONENT parents', () => {
            const node = makeNode({
                parentType: 'FRAME',
                width: 960,
                height: 400,
                layoutMode: 'NONE',
            });
            const result = getFrameSizeStyles(node);
            expect(result).toContain('width: 960px');
            expect(result).toContain('height: 400px');
        });
    });
});
