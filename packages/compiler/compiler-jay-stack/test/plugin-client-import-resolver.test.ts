import { describe, it, expect } from 'vitest';
import { extractPackageName, isSubpathImport, transformImports, type PluginDetector } from '../lib';

/**
 * Creates a mock plugin detector that returns true for specified packages.
 */
function createMockPluginDetector(pluginsWithClient: Set<string>): PluginDetector {
    return {
        isJayPluginWithClientExport(packageName: string): boolean {
            return pluginsWithClient.has(packageName);
        },
    };
}

describe('plugin-client-import-resolver', () => {
    describe('extractPackageName', () => {
        it('should return null for relative imports', () => {
            expect(extractPackageName('./utils')).toBeNull();
            expect(extractPackageName('../services/api')).toBeNull();
            expect(extractPackageName('./index.js')).toBeNull();
        });

        it('should return null for absolute imports', () => {
            expect(extractPackageName('/absolute/path')).toBeNull();
            expect(extractPackageName('/Users/dev/project/file')).toBeNull();
        });

        it('should extract scoped package names', () => {
            expect(extractPackageName('@jay-framework/wix-server-client')).toBe(
                '@jay-framework/wix-server-client',
            );
            expect(extractPackageName('@wix/stores')).toBe('@wix/stores');
            expect(extractPackageName('@scope/package')).toBe('@scope/package');
        });

        it('should extract scoped package from subpath imports', () => {
            expect(extractPackageName('@jay-framework/wix-server-client/client')).toBe(
                '@jay-framework/wix-server-client',
            );
            expect(extractPackageName('@wix/stores/products')).toBe('@wix/stores');
            expect(extractPackageName('@scope/pkg/deep/path')).toBe('@scope/pkg');
        });

        it('should extract unscoped package names', () => {
            expect(extractPackageName('lodash')).toBe('lodash');
            expect(extractPackageName('express')).toBe('express');
            expect(extractPackageName('react')).toBe('react');
        });

        it('should extract unscoped package from subpath imports', () => {
            expect(extractPackageName('lodash/debounce')).toBe('lodash');
            expect(extractPackageName('react/jsx-runtime')).toBe('react');
        });

        it('should return null for incomplete scoped packages', () => {
            expect(extractPackageName('@scope')).toBeNull();
            expect(extractPackageName('@')).toBeNull();
        });
    });

    describe('isSubpathImport', () => {
        it('should return false for main entry imports', () => {
            expect(isSubpathImport('@jay-framework/wix-stores', '@jay-framework/wix-stores')).toBe(
                false,
            );
            expect(isSubpathImport('lodash', 'lodash')).toBe(false);
            expect(isSubpathImport('react', 'react')).toBe(false);
        });

        it('should return true for subpath imports', () => {
            expect(
                isSubpathImport('@jay-framework/wix-stores/client', '@jay-framework/wix-stores'),
            ).toBe(true);
            expect(isSubpathImport('lodash/debounce', 'lodash')).toBe(true);
            expect(isSubpathImport('react/jsx-runtime', 'react')).toBe(true);
        });

        it('should return true for deep subpath imports', () => {
            expect(isSubpathImport('@scope/pkg/a/b/c', '@scope/pkg')).toBe(true);
        });
    });

    describe('transformImports', () => {
        const jayPlugins = new Set([
            '@jay-framework/wix-server-client',
            '@jay-framework/wix-stores',
        ]);

        const mockDetector = createMockPluginDetector(jayPlugins);

        const transform = (code: string) =>
            transformImports({
                code,
                projectRoot: '/test',
                filePath: '/test/file.ts',
                pluginDetector: mockDetector,
            });

        describe('import declarations', () => {
            it('should rewrite plugin main entry imports to /client', () => {
                const source = `import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(
                    `import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client/client';`,
                );
            });

            it('should not rewrite imports already using /client subpath', () => {
                const source = `import { init } from '@jay-framework/wix-server-client/client';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });

            it('should not rewrite imports using other subpaths', () => {
                const source = `import { foo } from '@jay-framework/wix-stores/actions';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });

            it('should not rewrite non-plugin imports', () => {
                const source = `import { useState } from 'react';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });

            it('should not rewrite relative imports', () => {
                const source = `import { helper } from './utils';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });

            it('should handle default imports', () => {
                const source = `import wixClient from '@jay-framework/wix-server-client';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(
                    `import wixClient from '@jay-framework/wix-server-client/client';`,
                );
            });

            it('should handle namespace imports', () => {
                const source = `import * as WixClient from '@jay-framework/wix-server-client';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(
                    `import * as WixClient from '@jay-framework/wix-server-client/client';`,
                );
            });

            it('should handle multiple named imports', () => {
                const source = `import { foo, bar, baz } from '@jay-framework/wix-stores';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(
                    `import { foo, bar, baz } from '@jay-framework/wix-stores/client';`,
                );
            });

            it('should preserve double quotes', () => {
                const source = `import { foo } from "@jay-framework/wix-server-client";`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(
                    `import { foo } from "@jay-framework/wix-server-client/client";`,
                );
            });
        });

        describe('export from declarations', () => {
            it('should rewrite re-exports to /client', () => {
                const source = `export { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(
                    `export { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client/client';`,
                );
            });

            it('should rewrite star re-exports to /client', () => {
                const source = `export * from '@jay-framework/wix-stores';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toBe(`export * from '@jay-framework/wix-stores/client';`);
            });

            it('should not rewrite re-exports already using subpath', () => {
                const source = `export { foo } from '@jay-framework/wix-stores/client';`;
                const result = transform(source);

                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });
        });

        describe('multiple imports', () => {
            it('should handle multiple imports in same file', () => {
                const source = `
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { WIX_STORES_CONTEXT } from '@jay-framework/wix-stores';
import { useState } from 'react';
`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toContain(`from '@jay-framework/wix-server-client/client'`);
                expect(result.code).toContain(`from '@jay-framework/wix-stores/client'`);
                expect(result.code).toContain(`from 'react'`);
            });

            it('should handle mixed imports and exports', () => {
                const source = `
import { foo } from '@jay-framework/wix-server-client';
export { bar } from '@jay-framework/wix-stores';
import { baz } from 'other-package';
`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                expect(result.code).toContain(
                    `import { foo } from '@jay-framework/wix-server-client/client'`,
                );
                expect(result.code).toContain(
                    `export { bar } from '@jay-framework/wix-stores/client'`,
                );
                expect(result.code).toContain(`import { baz } from 'other-package'`);
            });
        });

        describe('real-world scenarios', () => {
            it('should transform wix-stores-context.ts pattern', () => {
                const source = `
import { createJayContext, registerGlobalContext, useGlobalContext } from '@jay-framework/runtime';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { 
    getProductsV3Client, 
    getCategoriesClient, 
} from '../services/wix-store-api.js';

export const WIX_STORES_CONTEXT = createJayContext<WixStoresContext>();
`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                // Only wix-server-client should be rewritten
                expect(result.code).toContain(`from '@jay-framework/wix-server-client/client'`);
                // Other imports should be unchanged
                expect(result.code).toContain(`from '@jay-framework/runtime'`);
                expect(result.code).toContain(`from '../services/wix-store-api.js'`);
            });

            it('should handle fullstack component with plugin dependency', () => {
                const source = `
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { productsV3 } from '@wix/stores';

export const productPage = makeJayStackComponent()
    .withSlowly(() => {})
    .withInteractive(() => {});
`;
                const result = transform(source);

                expect(result.hasChanges).toBe(true);
                // Only wix-server-client should be rewritten (it's in our mock set)
                expect(result.code).toContain(`from '@jay-framework/wix-server-client/client'`);
                // fullstack-component is not in our test set of plugins
                expect(result.code).toContain(`from '@jay-framework/fullstack-component'`);
                // @wix/stores is not a Jay plugin
                expect(result.code).toContain(`from '@wix/stores'`);
            });
        });

        describe('edge cases', () => {
            it('should return hasChanges=false when no rewrites needed', () => {
                const source = `
import { useState } from 'react';
import { helper } from './utils';
`;
                const result = transform(source);

                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });

            it('should handle empty code', () => {
                const result = transform('');
                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe('');
            });

            it('should handle code without imports', () => {
                const source = `const x = 1; console.log(x);`;
                const result = transform(source);
                expect(result.hasChanges).toBe(false);
                expect(result.code).toBe(source);
            });
        });
    });
});
