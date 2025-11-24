import { describe, expect, it } from 'vitest';
import { parseContract } from '../lib/contract/contract-parser';
import { validateContractPhases, filterTagsByPhase, getEffectivePhase } from '../lib/contract/contract-phase-validator';
import { ContractTagType } from '../lib/contract/contract';

describe('Contract Phase Parsing', () => {
    it('should parse phase attribute from contract', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: slowField
    type: data
    dataType: string
    phase: slow
  - tag: fastField
    type: data
    dataType: string
    phase: fast
  - tag: interactiveField
    type: data
    dataType: number
    phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations).toEqual([]);
        expect(result.val).toBeDefined();
        expect(result.val.tags).toHaveLength(3);
        expect(result.val.tags[0].phase).toBe('slow');
        expect(result.val.tags[1].phase).toBe('fast');
        expect(result.val.tags[2].phase).toBe('fast+interactive');
    });

    it('should default to slow phase when not specified', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: field1
    type: data
    dataType: string
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations).toEqual([]);
        expect(result.val).toBeDefined();
        expect(result.val.tags[0].phase).toBeUndefined(); // Not set in YAML
        
        // But effective phase should be slow
        const effectivePhase = getEffectivePhase(result.val.tags[0]);
        expect(effectivePhase).toBe('slow');
    });

    it('should reject invalid phase values', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: field1
    type: data
    dataType: string
    phase: invalid-phase
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations.length).toBeGreaterThan(0);
        expect(result.validations[0]).toContain('invalid phase');
    });

    it('should reject phase on interactive tags', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: button
    type: interactive
    elementType: HTMLButtonElement
    phase: slow
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations.length).toBeGreaterThan(0);
        expect(result.validations[0]).toContain('interactive');
        expect(result.validations[0]).toContain('phase');
    });
});

describe('Contract Phase Validation', () => {
    it('should allow objects to have children with any phase (phase is just a default)', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: fastObject
    type: sub-contract
    phase: fast
    tags:
      - tag: slowChild
        type: data
        dataType: string
        phase: slow
      - tag: fastChild
        type: data
        dataType: string
        phase: fast
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        // Objects have no phase constraint - this should be valid
        expect(result.validations).toEqual([]);
    });

    it('should allow children with later phases', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: slowObject
    type: sub-contract
    phase: slow
    tags:
      - tag: fastChild
        type: data
        dataType: string
        phase: fast
      - tag: interactiveChild
        type: data
        dataType: number
        phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations).toEqual([]);
    });

    it('should allow array children with phase >= array phase', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: items
    type: sub-contract
    repeated: true
    phase: slow
    tags:
      - tag: name
        type: data
        dataType: string
        phase: fast
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations).toEqual([]);
    });

    it('should reject array children with earlier phase', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: items
    type: sub-contract
    repeated: true
    phase: fast
    tags:
      - tag: name
        type: data
        dataType: string
        phase: slow
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(result.validations.length).toBeGreaterThan(0);
        expect(result.validations[0]).toContain('earlier');
    });
});

describe('Phase Filtering', () => {
    it('should filter tags by slow phase', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: slowField
    type: data
    dataType: string
    phase: slow
  - tag: fastField
    type: data
    dataType: string
    phase: fast
  - tag: interactiveField
    type: data
    dataType: number
    phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        const slowTags = filterTagsByPhase(result.val.tags, 'slow');
        
        expect(slowTags).toHaveLength(1);
        expect(slowTags[0].tag).toBe('slowField');
    });

    it('should filter tags by fast phase (only fast properties)', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: slowField
    type: data
    dataType: string
    phase: slow
  - tag: fastField
    type: data
    dataType: string
    phase: fast
  - tag: interactiveField
    type: data
    dataType: number
    phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        const fastTags = filterTagsByPhase(result.val.tags, 'fast');
        
        expect(fastTags).toHaveLength(1);
        expect(fastTags[0].tag).toBe('fastField');
    });

    it('should filter tags by interactive phase (only interactive properties)', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: slowField
    type: data
    dataType: string
    phase: slow
  - tag: fastField
    type: data
    dataType: string
    phase: fast
  - tag: interactiveField
    type: data
    dataType: number
    phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        const interactiveTags = filterTagsByPhase(result.val.tags, 'fast+interactive');
        
        expect(interactiveTags).toHaveLength(1);
        expect(interactiveTags[0].tag).toBe('interactiveField');
    });

    it('should exclude interactive elements (without dataType) from ViewState', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: slowField
    type: data
    dataType: string
  - tag: button
    type: interactive
    elementType: HTMLButtonElement
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        const slowTags = filterTagsByPhase(result.val.tags, 'slow');
        
        // Should only include the data field, not the interactive button
        expect(slowTags).toHaveLength(1);
        expect(slowTags[0].tag).toBe('slowField');
    });

    it('should filter nested tags recursively', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: product
    type: sub-contract
    tags:
      - tag: name
        type: data
        dataType: string
        phase: slow
      - tag: inStock
        type: data
        dataType: boolean
        phase: fast
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        const slowTags = filterTagsByPhase(result.val.tags, 'slow');
        
        expect(slowTags).toHaveLength(1);
        expect(slowTags[0].tag).toBe('product');
        expect(slowTags[0].tags).toHaveLength(1);
        expect(slowTags[0].tags[0].tag).toBe('name');
    });
});

