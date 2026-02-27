import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadToolDescriptions, resetToolDescriptionsCache } from '../lib/agent/tool-descriptions';

vi.mock('@jay-framework/logger', () => ({
    getLogger: () => ({
        important: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('tool-descriptions', () => {
    beforeEach(() => {
        resetToolDescriptionsCache();
    });

    it('should return empty array when plugins-index.yaml does not exist', () => {
        const result = loadToolDescriptions('/nonexistent/path');
        expect(result).toEqual([]);
    });

    it('should extract interactive tag descriptions from contract', () => {
        const tmpDir = fs.mkdtempSync(path.join('/tmp', 'tool-desc-'));
        const agentKitDir = path.join(tmpDir, 'agent-kit');
        fs.mkdirSync(agentKitDir, { recursive: true });

        const contractDir = path.join(tmpDir, 'contracts');
        fs.mkdirSync(contractDir);

        // Write a test contract
        const contractPath = path.join(contractDir, 'test.jay-contract');
        fs.writeFileSync(
            contractPath,
            `name: test-component
tags:
  - tag: searchButton
    type: interactive
    elementType: HTMLButtonElement
    description: Search submit button
  - tag: title
    type: data
    dataType: string
    description: Page title (not interactive)
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
`,
        );

        // Write plugins-index.yaml
        fs.writeFileSync(
            path.join(agentKitDir, 'plugins-index.yaml'),
            `plugins:
  - name: test-plugin
    path: ./contracts
    contracts:
      - name: test-component
        type: static
        path: ./contracts/test.jay-contract
`,
        );

        const result = loadToolDescriptions(tmpDir);

        // Should include interactive tags with descriptions
        expect(result).toContainEqual({
            refName: 'searchButton',
            description: 'Search submit button',
        });

        // Should NOT include non-interactive tags
        expect(result.find((d) => d.refName === 'title')).toBeUndefined();

        // Should NOT include interactive tags without descriptions
        expect(result.find((d) => d.refName === 'addToCart')).toBeUndefined();

        // Cleanup
        fs.rmSync(tmpDir, { recursive: true });
    });

    it('should extract descriptions from nested sub-contracts', () => {
        const tmpDir = fs.mkdtempSync(path.join('/tmp', 'tool-desc-'));
        const agentKitDir = path.join(tmpDir, 'agent-kit');
        fs.mkdirSync(agentKitDir, { recursive: true });

        const contractDir = path.join(tmpDir, 'contracts');
        fs.mkdirSync(contractDir);

        const contractPath = path.join(contractDir, 'nested.jay-contract');
        fs.writeFileSync(
            contractPath,
            `name: nested-component
tags:
  - tag: filters
    type: sub-contract
    description: Product filters
    tags:
      - tag: isSelected
        type: interactive
        elementType: HTMLInputElement
        description: Category checkbox
      - tag: priceRange
        type: sub-contract
        tags:
          - tag: minPrice
            type: interactive
            elementType: HTMLInputElement
            description: Minimum price filter
`,
        );

        fs.writeFileSync(
            path.join(agentKitDir, 'plugins-index.yaml'),
            `plugins:
  - name: test
    path: ./contracts
    contracts:
      - name: nested-component
        type: static
        path: ./contracts/nested.jay-contract
`,
        );

        const result = loadToolDescriptions(tmpDir);

        expect(result).toContainEqual({
            refName: 'isSelected',
            description: 'Category checkbox',
        });
        expect(result).toContainEqual({
            refName: 'minPrice',
            description: 'Minimum price filter',
        });

        fs.rmSync(tmpDir, { recursive: true });
    });

    it('should handle multi-type tags (variant + interactive)', () => {
        const tmpDir = fs.mkdtempSync(path.join('/tmp', 'tool-desc-'));
        const agentKitDir = path.join(tmpDir, 'agent-kit');
        fs.mkdirSync(agentKitDir, { recursive: true });

        const contractDir = path.join(tmpDir, 'contracts');
        fs.mkdirSync(contractDir);

        const contractPath = path.join(contractDir, 'multi.jay-contract');
        fs.writeFileSync(
            contractPath,
            `name: multi-type
tags:
  - tag: selected
    type: [variant, interactive]
    elementType: HTMLImageElement
    description: Select this media item
`,
        );

        fs.writeFileSync(
            path.join(agentKitDir, 'plugins-index.yaml'),
            `plugins:
  - name: test
    path: ./contracts
    contracts:
      - name: multi-type
        type: static
        path: ./contracts/multi.jay-contract
`,
        );

        const result = loadToolDescriptions(tmpDir);

        expect(result).toContainEqual({
            refName: 'selected',
            description: 'Select this media item',
        });

        fs.rmSync(tmpDir, { recursive: true });
    });

    it('should cache results after first call', () => {
        const tmpDir = fs.mkdtempSync(path.join('/tmp', 'tool-desc-'));
        const agentKitDir = path.join(tmpDir, 'agent-kit');
        fs.mkdirSync(agentKitDir, { recursive: true });

        fs.writeFileSync(path.join(agentKitDir, 'plugins-index.yaml'), 'plugins: []\n');

        const result1 = loadToolDescriptions(tmpDir);
        const result2 = loadToolDescriptions(tmpDir);

        expect(result1).toBe(result2); // Same reference (cached)

        fs.rmSync(tmpDir, { recursive: true });
    });
});
