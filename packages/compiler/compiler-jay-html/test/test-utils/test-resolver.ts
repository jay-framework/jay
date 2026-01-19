import path from 'path';
import { WithValidations } from '@jay-framework/compiler-shared';
import {
    JAY_IMPORT_RESOLVER,
    JayImportResolver,
    PluginComponentResolution,
} from '../../lib/jay-target/jay-import-resolver';

/**
 * Test resolver that extends the default resolver with test plugin support.
 * This should ONLY be used in tests.
 */
export const TEST_IMPORT_RESOLVER: JayImportResolver = {
    ...JAY_IMPORT_RESOLVER,
    resolvePluginComponent(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<PluginComponentResolution> {
        // Handle test plugins for test fixtures
        // projectRoot for fixtures is test/fixtures (two levels up from filePath)
        if (pluginName === 'test-counter' && contractName === 'counter') {
            return new WithValidations(
                {
                    contractPath: path.resolve(
                        projectRoot,
                        'contracts/counter/counter.jay-contract',
                    ),
                    componentPath: path.resolve(projectRoot, 'contracts/counter/counter'),
                    componentName: 'counter',
                    isNpmPackage: false,
                },
                [],
            );
        }
        if (pluginName === 'test-named-counter' && contractName === 'named-counter') {
            return new WithValidations(
                {
                    contractPath: path.resolve(
                        projectRoot,
                        'contracts/named-counter/named-counter.jay-contract',
                    ),
                    componentPath: path.resolve(
                        projectRoot,
                        'contracts/named-counter/named-counter',
                    ),
                    componentName: 'namedCounter',
                    isNpmPackage: false,
                },
                [],
            );
        }
        if (pluginName === 'test-timer' && contractName === 'timer') {
            return new WithValidations(
                {
                    contractPath: path.resolve(projectRoot, 'contracts/timer/timer.jay-contract'),
                    componentPath: path.resolve(projectRoot, 'contracts/timer/timer'),
                    componentName: 'timer',
                    isNpmPackage: false,
                },
                [],
            );
        }
        if (pluginName === 'test-duplicate-ref' && contractName === 'duplicate-ref-headless') {
            return new WithValidations(
                {
                    contractPath: path.resolve(
                        projectRoot,
                        'contracts/duplicate-ref-headless/duplicate-ref-headless.jay-contract',
                    ),
                    componentPath: path.resolve(
                        projectRoot,
                        'contracts/duplicate-ref-headless/duplicate-ref-headless',
                    ),
                    componentName: 'duplicateRefHeadless',
                    isNpmPackage: false,
                },
                [],
            );
        }

        // Fall back to production resolver
        return JAY_IMPORT_RESOLVER.resolvePluginComponent(pluginName, contractName, projectRoot);
    },
};
