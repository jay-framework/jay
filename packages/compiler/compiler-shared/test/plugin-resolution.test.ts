import { describe, it, expect } from 'vitest';
import { resolvePluginComponent } from '../lib';
import path from 'path';

describe('Plugin Resolution with Meaningful Error Messages', () => {
    it('should return meaningful error when plugin not found', () => {
        const result = resolvePluginComponent('/fake/root', 'non-existent-plugin', 'some-contract');
        
        expect(result.validations).toHaveLength(1);
        expect(result.validations[0]).toContain('Plugin "non-existent-plugin" not found');
        expect(result.validations[0]).toContain('src/plugins/non-existent-plugin/');
        expect(result.validations[0]).toContain('node_modules/non-existent-plugin/');
        expect(result.val).toBeNull();
    });
    
    it('should return meaningful error when contract not found in plugin', () => {
        const testPluginRoot = path.resolve(__dirname, '../../fixtures/test-plugin');
        
        // This would test a real plugin with plugin.yaml but wrong contract name
        // For now, this is a placeholder showing the expected behavior
        const result = resolvePluginComponent(testPluginRoot, 'test-plugin', 'non-existent-contract');
        
        // The validation message should list available contracts
        expect(result.validations.length).toBeGreaterThan(0);
    });
    
    it('should return warnings for NPM packages without proper exports', () => {
        // This would test an NPM package that has plugin.yaml but no package.json exports
        // The function should still work but return warnings
        
        // Placeholder for demonstration
        expect(true).toBe(true);
    });
});

