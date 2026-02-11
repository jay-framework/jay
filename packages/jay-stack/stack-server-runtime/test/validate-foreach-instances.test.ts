import { describe, expect, it } from 'vitest';
import { validateForEachInstances } from '../lib/instance-slow-render';
import type { ForEachHeadlessInstance } from '@jay-framework/compiler-jay-html';
import type { HeadlessInstanceComponent } from '../lib/load-page-parts';
import { phaseOutput } from '@jay-framework/fullstack-component';

function makeComponent(
    contractName: string,
    hasSlowPhase: boolean,
    hasFastPhase: boolean,
): HeadlessInstanceComponent {
    return {
        contractName,
        compDefinition: {
            slowlyRender: hasSlowPhase ? async () => phaseOutput({}, {}) : undefined,
            fastRender: hasFastPhase ? async () => phaseOutput({}, {}) : undefined,
        } as any,
        contract: {} as any,
    };
}

function makeForEachInstance(contractName: string): ForEachHeadlessInstance {
    return {
        contractName,
        forEachPath: 'items',
        trackBy: '_id',
        propBindings: { productId: '{_id}' },
        coordinateSuffix: `${contractName}:0`,
    };
}

describe('validateForEachInstances', () => {
    it('should return no errors for fast-only component', () => {
        const forEachInstances = [makeForEachInstance('stock-status')];
        const components = [makeComponent('stock-status', false, true)];

        const errors = validateForEachInstances(forEachInstances, components);
        expect(errors).toEqual([]);
    });

    it('should return error for component with slow phase', () => {
        const forEachInstances = [makeForEachInstance('product-card')];
        const components = [makeComponent('product-card', true, true)];

        const errors = validateForEachInstances(forEachInstances, components);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('<jay:product-card> inside forEach has a slow rendering phase');
        expect(errors[0]).toContain('Use slowForEach instead');
    });

    it('should return no errors for interactive-only component (no slow, no fast)', () => {
        const forEachInstances = [makeForEachInstance('click-tracker')];
        const components = [makeComponent('click-tracker', false, false)];

        const errors = validateForEachInstances(forEachInstances, components);
        expect(errors).toEqual([]);
    });

    it('should return no errors for unknown component (not found)', () => {
        const forEachInstances = [makeForEachInstance('unknown-widget')];
        const components: HeadlessInstanceComponent[] = [];

        const errors = validateForEachInstances(forEachInstances, components);
        expect(errors).toEqual([]);
    });

    it('should validate each forEach instance independently', () => {
        const forEachInstances = [
            makeForEachInstance('stock-status'),
            makeForEachInstance('product-card'),
        ];
        const components = [
            makeComponent('stock-status', false, true),
            makeComponent('product-card', true, true),
        ];

        const errors = validateForEachInstances(forEachInstances, components);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('product-card');
    });
});
