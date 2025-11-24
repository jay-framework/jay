import { describe, expect, it } from 'vitest';
import { parseContract, compileContract, JayImportResolver, Contract } from '../lib/index';
import { WithValidations } from '@jay-framework/compiler-shared';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';
import path from 'path';
import fs from 'fs';

describe('Contract Compilation with Phases', () => {
    const noHopResolver: JayImportResolver = {
        analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions) {
            throw new Error(`not implemented`);
        },
        loadContract(path: string): WithValidations<Contract> {
            throw new Error(`Unknown path: ${path}`);
        },
        resolveLink: (link: string, importingModule: string) => {
            throw new Error(`Unknown link: ${link}`);
        },
    };

    it('should compile contract with phases and generate all ViewState types', async () => {
        const contractPath = path.resolve(
            __dirname,
            'fixtures/contracts/product-page-with-phases/product-page.jay-contract'
        );
        const contractYaml = fs.readFileSync(contractPath, 'utf-8');
        const parsedContract = parseContract(contractYaml, 'product-page.jay-contract');
        const result = await compileContract(parsedContract, contractPath, noHopResolver);

        expect(result.validations).toEqual([]);
        expect(result.val).toBeDefined();

        const generated = result.val!;

        // Check that all expected types are generated
        expect(generated).toContain('export interface ProductPageViewState');
        expect(generated).toContain('export interface ProductPageSlowViewState');
        expect(generated).toContain('export interface ProductPageFastViewState');
        expect(generated).toContain('export interface ProductPageInteractiveViewState');
        expect(generated).toContain('export interface ProductPageRefs');
        expect(generated).toContain('export type ProductPageContract = JayContract<');

        // Check that the contract type has all 5 type parameters
        expect(generated).toMatch(
            /export type ProductPageContract = JayContract<ProductPageViewState, ProductPageRefs, ProductPageSlowViewState, ProductPageFastViewState, ProductPageInteractiveViewState>/
        );

        // Validate SlowViewState contains slow fields (default)
        const slowViewStateMatch = generated.match(/export interface ProductPageSlowViewState \{([^}]+)\}/);
        expect(slowViewStateMatch).toBeTruthy();
        const slowViewState = slowViewStateMatch![1];
        expect(slowViewState).toContain('name');
        expect(slowViewState).toContain('sku');
        expect(slowViewState).toContain('price');

        // Validate FastViewState contains slow + fast fields
        const fastViewStateMatch = generated.match(/export interface ProductPageFastViewState \{([^}]+)\}/);
        expect(fastViewStateMatch).toBeTruthy();
        const fastViewState = fastViewStateMatch![1];
        expect(fastViewState).toContain('name');
        expect(fastViewState).toContain('sku');
        expect(fastViewState).toContain('price');
        expect(fastViewState).toContain('inStock');

        // Validate InteractiveViewState contains all fields
        const interactiveViewStateMatch = generated.match(/export interface ProductPageInteractiveViewState \{([^}]+)\}/);
        expect(interactiveViewStateMatch).toBeTruthy();
        const interactiveViewState = interactiveViewStateMatch![1];
        expect(interactiveViewState).toContain('name');
        expect(interactiveViewState).toContain('sku');
        expect(interactiveViewState).toContain('price');
        expect(interactiveViewState).toContain('inStock');
        expect(interactiveViewState).toContain('quantity');

        // Validate Full ViewState contains all data/variant fields
        const fullViewStateMatch = generated.match(/export interface ProductPageViewState \{([^}]+)\}/);
        expect(fullViewStateMatch).toBeTruthy();
        const fullViewState = fullViewStateMatch![1];
        expect(fullViewState).toContain('name');
        expect(fullViewState).toContain('sku');
        expect(fullViewState).toContain('price');
        expect(fullViewState).toContain('inStock');
        expect(fullViewState).toContain('quantity');

        // Validate Refs contains interactive elements
        const refsMatch = generated.match(/export interface ProductPageRefs \{([^}]+)\}/);
        expect(refsMatch).toBeTruthy();
        const refs = refsMatch![1];
        expect(refs).toContain('addToCart');
    });
});

