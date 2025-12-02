import { describe, it, expect } from 'vitest';
import {
    parseJayModuleSpecifier,
    addBuildEnvironment,
    hasJayExtension,
    getBasePath,
    hasBuildEnvironment,
    getBuildEnvironment,
    isLocalModule,
    JayBuildEnvironment,
} from '../lib/jay-module-specifier';
import { RuntimeMode } from '../lib/runtime-mode';

describe('parseJayModuleSpecifier', () => {
    it('should parse a simple path without query params', () => {
        const result = parseJayModuleSpecifier('./component');
        expect(result.basePath).toBe('./component');
        expect(result.buildEnvironment).toBeUndefined();
        expect(result.runtimeMode).toBeUndefined();
        expect(result.otherQueryParams).toBe('');
    });

    it('should parse path with jay-client query param', () => {
        const result = parseJayModuleSpecifier('./component?jay-client');
        expect(result.basePath).toBe('./component');
        expect(result.buildEnvironment).toBe(JayBuildEnvironment.Client);
        expect(result.runtimeMode).toBeUndefined();
    });

    it('should parse path with jay-server query param', () => {
        const result = parseJayModuleSpecifier('./component?jay-server');
        expect(result.basePath).toBe('./component');
        expect(result.buildEnvironment).toBe(JayBuildEnvironment.Server);
        expect(result.runtimeMode).toBeUndefined();
    });

    it('should parse path with runtime mode query param', () => {
        const result = parseJayModuleSpecifier('./component?jay-mainSandbox');
        expect(result.basePath).toBe('./component');
        expect(result.buildEnvironment).toBeUndefined();
        expect(result.runtimeMode).toBe(RuntimeMode.MainSandbox);
    });

    it('should parse path with runtime mode and .ts suffix', () => {
        const result = parseJayModuleSpecifier('./component?jay-workerTrusted.ts');
        expect(result.basePath).toBe('./component');
        expect(result.runtimeMode).toBe(RuntimeMode.WorkerTrusted);
    });

    it('should parse contract file with jay-client', () => {
        const result = parseJayModuleSpecifier('./mood-tracker.jay-contract?jay-client');
        expect(result.basePath).toBe('./mood-tracker.jay-contract');
        expect(result.buildEnvironment).toBe(JayBuildEnvironment.Client);
    });

    it('should parse jay-html file with jay-server', () => {
        const result = parseJayModuleSpecifier('./page.jay-html?jay-server');
        expect(result.basePath).toBe('./page.jay-html');
        expect(result.buildEnvironment).toBe(JayBuildEnvironment.Server);
    });

    it('should handle both build environment and runtime mode', () => {
        const result = parseJayModuleSpecifier('./component?jay-client?jay-mainSandbox');
        expect(result.basePath).toBe('./component');
        expect(result.buildEnvironment).toBe(JayBuildEnvironment.Client);
        expect(result.runtimeMode).toBe(RuntimeMode.MainSandbox);
    });
});

describe('addBuildEnvironment', () => {
    it('should add jay-client to a simple path', () => {
        const result = addBuildEnvironment('./component', JayBuildEnvironment.Client);
        expect(result).toBe('./component?jay-client');
    });

    it('should add jay-server to a simple path', () => {
        const result = addBuildEnvironment('./component', JayBuildEnvironment.Server);
        expect(result).toBe('./component?jay-server');
    });

    it('should add jay-client to a contract file', () => {
        const result = addBuildEnvironment('./mood-tracker.jay-contract', JayBuildEnvironment.Client);
        expect(result).toBe('./mood-tracker.jay-contract?jay-client');
    });

    it('should replace existing build environment', () => {
        const result = addBuildEnvironment('./component?jay-server', JayBuildEnvironment.Client);
        expect(result).toBe('./component?jay-client');
    });

    it('should preserve runtime mode when adding build environment', () => {
        const result = addBuildEnvironment('./component?jay-mainSandbox', JayBuildEnvironment.Client);
        expect(result).toBe('./component?jay-client?jay-mainSandbox');
    });
});

describe('hasJayExtension', () => {
    it('should detect jay-contract extension without query params', () => {
        expect(hasJayExtension('./mood-tracker.jay-contract', '.jay-contract')).toBe(true);
    });

    it('should detect jay-contract extension with jay-client query param', () => {
        expect(hasJayExtension('./mood-tracker.jay-contract?jay-client', '.jay-contract')).toBe(true);
    });

    it('should detect jay-contract extension with jay-server query param', () => {
        expect(hasJayExtension('./mood-tracker.jay-contract?jay-server', '.jay-contract')).toBe(true);
    });

    it('should detect jay-html extension with query params', () => {
        expect(hasJayExtension('./page.jay-html?jay-client', '.jay-html')).toBe(true);
    });

    it('should return false for wrong extension', () => {
        expect(hasJayExtension('./component.ts?jay-client', '.jay-contract')).toBe(false);
    });

    it('should handle withTs option', () => {
        expect(hasJayExtension('./page.jay-html.ts?jay-client', '.jay-html', { withTs: true })).toBe(true);
    });

    it('should not match extension in the middle of path', () => {
        // The extension must be at the end of the base path
        expect(hasJayExtension('.jay-contract/file.ts', '.jay-contract')).toBe(false);
    });
});

describe('getBasePath', () => {
    it('should return the path without query params', () => {
        expect(getBasePath('./component?jay-client')).toBe('./component');
    });

    it('should return the same path if no query params', () => {
        expect(getBasePath('./component')).toBe('./component');
    });

    it('should handle contract files', () => {
        expect(getBasePath('./mood-tracker.jay-contract?jay-server')).toBe('./mood-tracker.jay-contract');
    });
});

describe('hasBuildEnvironment', () => {
    it('should return true for jay-client', () => {
        expect(hasBuildEnvironment('./component?jay-client')).toBe(true);
    });

    it('should return true for jay-server', () => {
        expect(hasBuildEnvironment('./component?jay-server')).toBe(true);
    });

    it('should return false for no query params', () => {
        expect(hasBuildEnvironment('./component')).toBe(false);
    });

    it('should return false for only runtime mode', () => {
        expect(hasBuildEnvironment('./component?jay-mainSandbox')).toBe(false);
    });
});

describe('getBuildEnvironment', () => {
    it('should return client for jay-client', () => {
        expect(getBuildEnvironment('./component?jay-client')).toBe(JayBuildEnvironment.Client);
    });

    it('should return server for jay-server', () => {
        expect(getBuildEnvironment('./component?jay-server')).toBe(JayBuildEnvironment.Server);
    });

    it('should return undefined for no build environment', () => {
        expect(getBuildEnvironment('./component')).toBeUndefined();
    });
});

describe('isLocalModule', () => {
    it('should return true for ./ paths', () => {
        expect(isLocalModule('./component')).toBe(true);
    });

    it('should return true for ../ paths', () => {
        expect(isLocalModule('../component')).toBe(true);
    });

    it('should return true for local paths with query params', () => {
        expect(isLocalModule('./component?jay-client')).toBe(true);
    });

    it('should return false for npm packages', () => {
        expect(isLocalModule('@jay-framework/fullstack-component')).toBe(false);
    });

    it('should return false for npm packages with query params', () => {
        expect(isLocalModule('some-package?jay-client')).toBe(false);
    });
});

