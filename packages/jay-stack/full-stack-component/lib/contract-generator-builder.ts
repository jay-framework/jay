import {
    GeneratedContractYaml,
    ContractGeneratorFunction,
    DynamicContractGenerator,
    ServiceMarkers,
} from './jay-stack-types';

/**
 * Contract Generator Builder
 *
 * Provides a fluent API for creating dynamic contract generators with service injection.
 *
 * @example
 * ```typescript
 * import { makeContractGenerator } from '@jay-framework/fullstack-component';
 * import { CMS_SERVICE } from '../services/cms-service';
 *
 * export const generator = makeContractGenerator()
 *   .withServices(CMS_SERVICE)
 *   .generateWith(async (cmsService) => {
 *     const collections = await cmsService.getCollections();
 *     return collections.map(col => ({
 *       name: `${toPascalCase(col.name)}List`,
 *       yaml: generateContractYaml(col),
 *       description: `List view for ${col.displayName}`
 *     }));
 *   });
 * ```
 */

type ContractGeneratorBuilderState = 'Initial' | 'WithServices' | 'Done';

/**
 * Builder interface for contract generators without services
 */
interface ContractGeneratorBuilderInitial {
    /**
     * Adds service dependencies to the contract generator.
     * Services will be injected when generateWith() is called.
     */
    withServices<Services extends Array<any>>(
        ...serviceMarkers: ServiceMarkers<Services>
    ): ContractGeneratorBuilderWithServices<Services>;

    /**
     * Defines the contract generation function without services.
     */
    generateWith(fn: () => Promise<GeneratedContractYaml[]> | GeneratedContractYaml[]): DynamicContractGenerator<[]>;
}

/**
 * Builder interface for contract generators with services
 */
interface ContractGeneratorBuilderWithServices<Services extends Array<any>> {
    /**
     * Defines the contract generation function with service injection.
     * Services are provided as parameters based on the order specified in withServices().
     */
    generateWith(fn: ContractGeneratorFunction<Services>): DynamicContractGenerator<Services>;
}

class ContractGeneratorBuilderImpl<Services extends Array<any> = []> {
    private serviceMarkers: ServiceMarkers<Services>;

    constructor(serviceMarkers: ServiceMarkers<Services> = [] as any) {
        this.serviceMarkers = serviceMarkers;
    }

    withServices<NewServices extends Array<any>>(
        ...serviceMarkers: ServiceMarkers<NewServices>
    ): ContractGeneratorBuilderWithServices<NewServices> {
        return new ContractGeneratorBuilderImpl<NewServices>(serviceMarkers);
    }

    generateWith(fn: ContractGeneratorFunction<Services>): DynamicContractGenerator<Services> {
        return {
            services: this.serviceMarkers,
            generate: fn,
        };
    }
}

/**
 * Creates a new contract generator builder.
 *
 * @returns A builder for creating dynamic contract generators
 *
 * @example
 * ```typescript
 * // Without services
 * export const generator = makeContractGenerator()
 *   .generateWith(async () => {
 *     return [
 *       { name: 'Contract1', yaml: 'name: Contract1\ntags: [...]' },
 *       { name: 'Contract2', yaml: 'name: Contract2\ntags: [...]' }
 *     ];
 *   });
 *
 * // With services
 * export const generator = makeContractGenerator()
 *   .withServices(CMS_SERVICE, API_SERVICE)
 *   .generateWith(async (cms, api) => {
 *     const data = await cms.fetch();
 *     return data.map(item => ({ 
 *       name: item.name, 
 *       yaml: generateYaml(item) 
 *     }));
 *   });
 * ```
 */
export function makeContractGenerator(): ContractGeneratorBuilderInitial {
    return new ContractGeneratorBuilderImpl();
}

