import type { ContractTag, FigmaVendorDocument, Plugin, ProjectPage } from '@jay-framework/editor-protocol';
import type { LayerBinding, BindingAnalysis, ConversionContext } from './types';

/**
 * Finds a contract tag by path in the contract tags array
 */
export function findContractTag(tags: ContractTag[], tagPath: string[]): ContractTag | undefined {
    if (tagPath.length === 0) {
        return undefined;
    }

    const tag = tags.find((t) => t.tag === tagPath[0]);

    if (!tag) {
        return undefined;
    }

    // If this is the last segment in the path, return the tag
    if (tagPath.length === 1) {
        return tag;
    }

    // Otherwise, continue recursively through the tag's children
    if (!tag.tags || tag.tags.length === 0) {
        return undefined; // Path continues but no children exist
    }

    return findContractTag(tag.tags, tagPath.slice(1));
}

/**
 * Finds a plugin by name
 */
function findPlugin(plugins: Plugin[], pluginName: string): Plugin | undefined {
    return plugins.find((p) => p.name === pluginName);
}

/**
 * Finds a contract in a plugin
 */
function findPluginContract(
    plugin: Plugin,
    componentName: string,
): { tags: ContractTag[] } | undefined {
    const contract = plugin.contracts.find((c) => c.name === componentName);
    return contract ? { tags: contract.tags } : undefined;
}

/**
 * Finds a page contract
 */
function findPageContract(projectPage: ProjectPage): { tags: ContractTag[] } | undefined {
    // TODO: Implement page contract lookup
    // For now, return undefined as we're focusing on plugin contracts
    return projectPage.contract ? { tags: projectPage.contract.tags } : undefined;
}

/**
 * Checks if a tag is a data type
 */
function isDataTag(contractTag: ContractTag): boolean {
    if (Array.isArray(contractTag.type)) {
        return contractTag.type.includes('data');
    }
    return contractTag.type === 'data';
}

/**
 * Checks if a tag is an interactive type
 */
function isInteractiveTag(contractTag: ContractTag): boolean {
    if (Array.isArray(contractTag.type)) {
        return contractTag.type.includes('interactive');
    }
    return contractTag.type === 'interactive';
}

/**
 * Checks if a tag is a dual type (data + interactive)
 */
function isDualTag(contractTag: ContractTag): boolean {
    if (Array.isArray(contractTag.type)) {
        return contractTag.type.includes('data') && contractTag.type.includes('interactive');
    }
    return false;
}

/**
 * Checks if a tag is a repeater
 */
function isRepeaterTag(contractTag: ContractTag): boolean {
    return contractTag.type === 'subContract' && contractTag.repeated === true;
}

/**
 * Applies repeater context to a path, removing repeater prefixes
 */
export function applyRepeaterContext(path: string, repeaterStack: string[][]): string {
    // Remove repeater prefixes from path
    for (const repeaterPath of repeaterStack) {
        const prefix = repeaterPath.join('.') + '.';
        if (path.startsWith(prefix)) {
            path = path.substring(prefix.length);
        }
    }
    return path;
}

/**
 * Resolves a binding to a full tag path with plugin key and contract tag
 */
function resolveBinding(
    binding: LayerBinding,
    context: ConversionContext,
): { fullPath: string; contractTag: ContractTag } | undefined {
    // 1. Find contract (plugin or page)
    let contract: { tags: ContractTag[] } | undefined;
    let key: string | undefined;
    let tagPathWithoutKey: string[];

    if (binding.pageContractPath.pluginName && binding.pageContractPath.componentName) {
        // Plugin contract
        const plugin = findPlugin(context.plugins, binding.pageContractPath.pluginName);
        if (!plugin) {
            console.warn(
                `Plugin not found: ${binding.pageContractPath.pluginName}`,
            );
            return undefined;
        }

        contract = findPluginContract(plugin, binding.pageContractPath.componentName);
        if (!contract) {
            console.warn(
                `Contract not found in plugin: ${binding.pageContractPath.componentName}`,
            );
            return undefined;
        }

        // Find the key (component instance key)
        const usedComponent = context.projectPage.usedComponents?.find(
            (c: any) => c.componentName === binding.pageContractPath.componentName,
        );
        if (!usedComponent) {
            console.warn(
                `Used component not found: ${binding.pageContractPath.componentName}`,
            );
            return undefined;
        }
        key = usedComponent.key;
        
        // For plugin contracts, skip first element (contract key from binding)
        tagPathWithoutKey = binding.tagPath.slice(1);
    } else {
        // Page contract
        contract = findPageContract(context.projectPage);
        if (!contract) {
            console.warn(`Page contract not found`);
            return undefined;
        }
        
        // For page contracts, use full path (no key to skip)
        tagPathWithoutKey = binding.tagPath;
    }

    // 2. Find tag in contract
    const contractTag = findContractTag(contract.tags, tagPathWithoutKey);
    if (!contractTag) {
        console.warn(
            `Contract tag not found: ${tagPathWithoutKey.join('.')}`,
        );
        return undefined;
    }

    // 3. Build full path
    let fullPath: string;
    if (key) {
        // Plugin contract: prefix with key
        fullPath = [key, ...tagPathWithoutKey].join('.');
    } else {
        // Page contract: use tag path directly (no key prefix)
        fullPath = binding.tagPath.join('.');
    }

    // 4. Apply repeater context
    fullPath = applyRepeaterContext(fullPath, context.repeaterPathStack);

    return { fullPath, contractTag };
}

/**
 * Gets bindings data from node plugin data
 */
export function getBindingsData(node: FigmaVendorDocument): LayerBinding[] {
    const bindingsDataRaw = node.pluginData?.['jay-layer-bindings'];
    if (bindingsDataRaw) {
        try {
            return JSON.parse(bindingsDataRaw);
        } catch (error) {
            console.warn(`Failed to parse bindings data for node ${node.name}:`, error);
            return [];
        }
    }
    return [];
}

/**
 * Analyzes bindings for a node and returns conversion strategy
 */
export function analyzeBindings(
    bindings: LayerBinding[],
    context: ConversionContext,
): BindingAnalysis {
    const analysis: BindingAnalysis = {
        type: 'none',
        attributes: new Map(),
        propertyBindings: [],
        isRepeater: false,
    };

    if (bindings.length === 0) {
        return analysis;
    }

    // Resolve all bindings
    const resolved = bindings
        .map((b) => ({
            binding: b,
            ...resolveBinding(b, context),
        }))
        .filter((r) => r.fullPath && r.contractTag);

    if (resolved.length === 0) {
        return analysis;
    }

    // Check for repeater (takes precedence)
    const repeaterBinding = resolved.find((r) => isRepeaterTag(r.contractTag!));
    if (repeaterBinding) {
        analysis.type = 'repeater';
        analysis.isRepeater = true;
        analysis.repeaterPath = repeaterBinding.fullPath;
        analysis.repeaterTag = repeaterBinding.contractTag;
        analysis.trackByKey = repeaterBinding.contractTag!.trackBy || 'id';
        return analysis;
    }

    // Check for property bindings (variants)
    const propertyBindings = resolved.filter((r) => r.binding.property);
    if (propertyBindings.length > 0) {
        // All bindings must be property bindings
        if (propertyBindings.length !== resolved.length) {
            console.warn(
                `Node has mixed property and non-property bindings - this is invalid`,
            );
        }
        analysis.type = 'property-variant';
        analysis.propertyBindings = propertyBindings.map((r) => ({
            property: r.binding.property!,
            tagPath: r.fullPath!,
            contractTag: r.contractTag!,
        }));
        return analysis;
    }

    // Check for attribute bindings
    const attributeBindings = resolved.filter((r) => r.binding.attribute);
    if (attributeBindings.length > 0) {
        analysis.type = 'attribute';
        for (const r of attributeBindings) {
            analysis.attributes.set(r.binding.attribute!, r.fullPath!);
        }
    }

    // Check for dynamic content / interactive bindings (no attribute, no property)
    const contentBindings = resolved.filter((r) => !r.binding.attribute && !r.binding.property);
    if (contentBindings.length > 0) {
        const binding = contentBindings[0]; // Take first one

        if (isDualTag(binding.contractTag!)) {
            analysis.type = 'dual';
            analysis.dualPath = binding.fullPath;
        } else if (isInteractiveTag(binding.contractTag!)) {
            analysis.type = 'interactive';
            analysis.refPath = binding.fullPath;
        } else if (isDataTag(binding.contractTag!)) {
            if (analysis.type === 'attribute') {
                // Keep attribute type, but add dynamic content
                analysis.dynamicContentPath = binding.fullPath;
                analysis.dynamicContentTag = binding.contractTag;
            } else {
                analysis.type = 'dynamic-content';
                analysis.dynamicContentPath = binding.fullPath;
                analysis.dynamicContentTag = binding.contractTag;
            }
        }
    }

    return analysis;
}

/**
 * Validates that bindings are consistent and allowed
 */
export function validateBindings(analysis: BindingAnalysis, node: FigmaVendorDocument): void {
    // Property bindings must be exclusive
    if (analysis.type === 'property-variant' && analysis.attributes.size > 0) {
        console.warn(
            `Node "${node.name}" has both property and attribute bindings - this is invalid`,
        );
    }

    // Interactive bindings cannot have attributes or properties
    if (analysis.type === 'interactive' && analysis.attributes.size > 0) {
        console.warn(
            `Node "${node.name}" has interactive binding with attributes - this is invalid`,
        );
    }
}
