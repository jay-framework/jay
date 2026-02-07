import path from 'path';
import fs from 'fs';
import { WithValidations } from '@jay-framework/compiler-shared';
import {
    JAY_IMPORT_RESOLVER,
    JayImportResolver,
    PluginComponentResolution,
} from '../../lib/jay-target/jay-import-resolver';
import { parseContract } from '../../lib';
import { Contract } from '../../lib';

/**
 * Test resolver that extends the default resolver with test plugin support.
 * This should ONLY be used in tests.
 */
export const TEST_IMPORT_RESOLVER: JayImportResolver = {
    ...JAY_IMPORT_RESOLVER,
    loadPluginContract(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<{ contract: Contract; contractPath: string }> {
        // Handle test plugins for test fixtures
        const testPluginMappings: Record<string, { dir: string; file: string }> = {
            'test-counter:counter': { dir: 'counter', file: 'counter' },
            'test-named-counter:named-counter': { dir: 'named-counter', file: 'named-counter' },
            'test-timer:timer': { dir: 'timer', file: 'timer' },
            'test-duplicate-ref:duplicate-ref-headless': {
                dir: 'duplicate-ref-headless',
                file: 'duplicate-ref-headless',
            },
            'test-product-card:product-card': { dir: 'product-card', file: 'product-card' },
        };

        const key = `${pluginName}:${contractName}`;
        const mapping = testPluginMappings[key];

        if (mapping) {
            const contractPath = path.resolve(
                projectRoot,
                `contracts/${mapping.dir}/${mapping.file}.jay-contract`,
            );

            if (fs.existsSync(contractPath)) {
                const content = fs.readFileSync(contractPath).toString();
                const contractResult = parseContract(content, contractPath);
                return contractResult.map((contract) => ({ contract, contractPath }));
            }
        }

        // Fall back to production resolver
        return JAY_IMPORT_RESOLVER.loadPluginContract(pluginName, contractName, projectRoot);
    },
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
        if (pluginName === 'test-product-card' && contractName === 'product-card') {
            return new WithValidations(
                {
                    contractPath: path.resolve(
                        projectRoot,
                        'contracts/product-card/product-card.jay-contract',
                    ),
                    componentPath: path.resolve(
                        projectRoot,
                        'contracts/product-card/product-card',
                    ),
                    componentName: 'productCard',
                    isNpmPackage: false,
                },
                [],
            );
        }

        // Fall back to production resolver
        return JAY_IMPORT_RESOLVER.resolvePluginComponent(pluginName, contractName, projectRoot);
    },
};
