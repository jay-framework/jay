import { describe, expect, it } from 'vitest';
import {
    slowRenderTransform,
    hasSlowPhaseProperties,
    SlowRenderInput,
} from '../../lib/slow-render/slow-render-transform';
import { parseContract } from '../../lib/contract/contract-parser';
import { Contract } from '../../lib/contract';
import { checkValidationErrors, prettifyHtml } from '@jay-framework/compiler-shared';
import { promises } from 'node:fs';
import path from 'path';

const { readFile } = promises;

// Helper to read fixture files
function fixtureDir(folder: string): string {
    return path.resolve(__dirname, `../fixtures/slow-render/${folder}`);
}

async function readSlowRenderFixture(folder: string): Promise<{
    input: string;
    slowViewState: Record<string, unknown>;
    contract: Contract;
    expectedOutput: string;
}> {
    const dir = fixtureDir(folder);
    const [input, slowViewState, contractYaml, expectedOutput] = await Promise.all([
        readFile(path.join(dir, 'input.jay-html'), 'utf-8'),
        readFile(path.join(dir, 'slow-view-state.json'), 'utf-8').then(JSON.parse),
        readFile(path.join(dir, 'contract.yaml'), 'utf-8'),
        readFile(path.join(dir, 'expected-output.jay-html'), 'utf-8'),
    ]);
    const contract = checkValidationErrors(parseContract(contractYaml, 'contract.yaml'));
    return { input, slowViewState, contract, expectedOutput };
}

async function runSlowRenderTest(folder: string) {
    const fixture = await readSlowRenderFixture(folder);
    const input: SlowRenderInput = {
        jayHtmlContent: fixture.input,
        slowViewState: fixture.slowViewState,
        contract: fixture.contract,
    };

    const result = slowRenderTransform(input);
    expect(result.validations).toEqual([]);
    expect(prettifyHtml(result.val!.preRenderedJayHtml)).toEqual(
        prettifyHtml(fixture.expectedOutput),
    );
}

describe('Slow Render Transform', () => {
    describe('Text Binding Resolution', () => {
        it('should resolve simple slow text bindings', async () => {
            await runSlowRenderTest('text-bindings');
        });

        it('should preserve fast phase bindings', async () => {
            await runSlowRenderTest('fast-bindings-preserved');
        });

        it('should handle mixed text with multiple bindings', async () => {
            await runSlowRenderTest('mixed-text-bindings');
        });
    });

    describe('Attribute Binding Resolution', () => {
        it('should resolve slow bindings in attributes', async () => {
            await runSlowRenderTest('attribute-slow-bindings');
        });

        it('should preserve fast bindings in attributes', async () => {
            await runSlowRenderTest('attribute-fast-preserved');
        });
    });

    describe('Style Binding Resolution', () => {
        it('should resolve slow bindings in style attributes', async () => {
            await runSlowRenderTest('style-bindings');
        });
    });

    describe('Conditional (if) Handling', () => {
        it('should remove element when slow condition is false', async () => {
            await runSlowRenderTest('conditional-false');
        });

        it('should keep element and remove if when slow condition is true', async () => {
            await runSlowRenderTest('conditional-true');
        });

        it('should preserve fast conditionals', async () => {
            await runSlowRenderTest('conditional-fast-preserved');
        });
    });

    describe('forEach Array Unrolling', () => {
        it('should unroll slow arrays with slowForEach', async () => {
            await runSlowRenderTest('foreach-unrolling');
        });

        it('should handle mixed-phase arrays (slow array with fast properties)', async () => {
            await runSlowRenderTest('foreach-mixed-phase');
        });

        it('should preserve fast arrays', async () => {
            await runSlowRenderTest('foreach-fast-preserved');
        });
    });

    describe('Component and Recursive Handling', () => {
        it('should preserve recursive regions with fast phase data', async () => {
            await runSlowRenderTest('recursive-preserved');
        });

        it('should preserve headless component references and resolve slow bindings', async () => {
            await runSlowRenderTest('headless-preserved');
        });
    });
});

describe('hasSlowPhaseProperties', () => {
    it('should return true when contract has slow properties', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: title
    type: data
    dataType: string
    phase: slow
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(hasSlowPhaseProperties(result.val)).toBe(true);
    });

    it('should return true when contract has properties without explicit phase (defaults to slow)', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: title
    type: data
    dataType: string
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(hasSlowPhaseProperties(result.val)).toBe(true);
    });

    it('should return false when all properties are fast or interactive', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: count
    type: data
    dataType: number
    phase: fast
  - tag: selected
    type: data
    dataType: boolean
    phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(hasSlowPhaseProperties(result.val)).toBe(false);
    });

    it('should return false for undefined contract', () => {
        expect(hasSlowPhaseProperties(undefined)).toBe(false);
    });
});
