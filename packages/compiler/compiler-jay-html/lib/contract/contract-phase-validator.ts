import { Contract, ContractTag, ContractTagType, RenderingPhase } from './contract';

/**
 * Phase ordering: slow < fast < fast+interactive
 */
const PHASE_ORDER: Record<RenderingPhase, number> = {
    'slow': 0,
    'fast': 1,
    'fast+interactive': 2,
};

/**
 * Default phase when not specified
 */
const DEFAULT_PHASE: RenderingPhase = 'slow';

/**
 * Get the effective phase for a tag (explicit or default)
 */
export function getEffectivePhase(tag: ContractTag, parentPhase?: RenderingPhase): RenderingPhase {
    // Interactive tags are implicitly fast+interactive
    if (tag.type.includes(ContractTagType.interactive)) {
        return 'fast+interactive';
    }
    
    // Use explicit phase if provided
    if (tag.phase) {
        return tag.phase;
    }
    
    // Inherit from parent phase for nested tags
    if (parentPhase) {
        return parentPhase;
    }
    
    // Default to slow
    return DEFAULT_PHASE;
}

/**
 * Compare two phases
 * Returns true if childPhase >= parentPhase
 */
function isPhaseCompatible(childPhase: RenderingPhase, parentPhase: RenderingPhase): boolean {
    return PHASE_ORDER[childPhase] >= PHASE_ORDER[parentPhase];
}

/**
 * Check if a tag should be included in a specific phase's ViewState
 * A tag is included if its effective phase exactly matches the target phase
 */
export function isTagInPhase(
    tag: ContractTag,
    targetPhase: RenderingPhase,
    parentPhase?: RenderingPhase
): boolean {
    // Skip interactive tags - they go into Refs, not ViewState
    if (tag.type.includes(ContractTagType.interactive) && !tag.dataType) {
        return false;
    }
    
    const effectivePhase = getEffectivePhase(tag, parentPhase);
    // Include only if effective phase exactly matches target phase
    return effectivePhase === targetPhase;
}

/**
 * Validate phase constraints for a tag and its children
 */
function validateTagPhases(
    tag: ContractTag,
    parentPhase?: RenderingPhase,
    tagPath: string = ''
): string[] {
    const validations: string[] = [];
    const currentPath = tagPath ? `${tagPath}.${tag.tag}` : tag.tag;
    const effectivePhase = getEffectivePhase(tag, parentPhase);
    
    // Validate that child phase >= parent phase (if parent exists)
    if (parentPhase && !isPhaseCompatible(effectivePhase, parentPhase)) {
        validations.push(
            `Tag [${currentPath}] has phase [${effectivePhase}] which is earlier than parent phase [${parentPhase}]. ` +
            `Child phases must be same or later than parent (slow < fast < fast+interactive)`
        );
    }
    
    // Validate nested tags (sub-contracts)
    if (tag.type.includes(ContractTagType.subContract) && tag.tags) {
        if (tag.repeated) {
            // Array: children must have phase >= array phase
            tag.tags.forEach((childTag) => {
                const childValidations = validateTagPhases(childTag, effectivePhase, currentPath);
                validations.push(...childValidations);
            });
        } else {
            // Object: phase is just a default, no parent-child constraint
            // Children inherit the default but are free to override without validation
            tag.tags.forEach((childTag) => {
                // Pass undefined as parentPhase to skip parent-child validation
                // But pass effectivePhase as the inherited default for children without explicit phase
                const childValidations = validateTagPhases(childTag, undefined, currentPath);
                validations.push(...childValidations);
            });
        }
    }
    
    return validations;
}

/**
 * Validate phase constraints across the entire contract
 */
export function validateContractPhases(contract: Contract): string[] {
    const validations: string[] = [];
    
    contract.tags.forEach((tag) => {
        const tagValidations = validateTagPhases(tag);
        validations.push(...tagValidations);
    });
    
    return validations;
}

/**
 * Filter tags recursively by phase
 * Returns only tags that should be included in the target phase's ViewState
 */
export function filterTagsByPhase(
    tags: ContractTag[],
    targetPhase: RenderingPhase,
    parentPhase?: RenderingPhase
): ContractTag[] {
    const filteredTags: ContractTag[] = [];
    
    for (const tag of tags) {
        // Check if this tag should be included in this phase
        if (!isTagInPhase(tag, targetPhase, parentPhase)) {
            continue;
        }
        
        const effectivePhase = getEffectivePhase(tag, parentPhase);
        
        // If it's a sub-contract with nested tags, filter them recursively
        if (tag.type.includes(ContractTagType.subContract) && tag.tags) {
            const filteredNestedTags = filterTagsByPhase(tag.tags, targetPhase, effectivePhase);
            
            // Only include the sub-contract if it has children in this phase
            if (filteredNestedTags.length > 0) {
                filteredTags.push({
                    ...tag,
                    tags: filteredNestedTags,
                });
            }
        } else {
            // Regular tag - include it
            filteredTags.push(tag);
        }
    }
    
    return filteredTags;
}

/**
 * Create a phase-specific contract
 * Returns a contract with only tags that belong to the target phase
 */
export function createPhaseContract(
    contract: Contract,
    targetPhase: RenderingPhase
): Contract {
    return {
        ...contract,
        tags: filterTagsByPhase(contract.tags, targetPhase),
    };
}

