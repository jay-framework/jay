import path from 'path';
import { Contract } from './contract';
import { JayImportResolver } from '../jay-target/jay-import-resolver';

const JAY_CONTRACT_EXTENSION = '.jay-contract';

/**
 * Load a linked contract using the import resolver.
 * Returns the parsed contract or null if not found/failed.
 *
 * @param linkPath - The link path from the contract (e.g., "./product-card")
 * @param baseContractDir - Directory of the contract containing the link
 * @param importResolver - Import resolver for loading contracts
 */
export function loadLinkedContract(
    linkPath: string,
    baseContractDir: string,
    importResolver: JayImportResolver,
): Contract | null {
    const linkWithExtension = linkPath.endsWith(JAY_CONTRACT_EXTENSION)
        ? linkPath
        : linkPath + JAY_CONTRACT_EXTENSION;

    try {
        const absolutePath = importResolver.resolveLink(baseContractDir, linkWithExtension);
        const contractResult = importResolver.loadContract(absolutePath);
        return contractResult.val ?? null;
    } catch {
        return null;
    }
}

/**
 * Get the directory of a linked contract for resolving nested links.
 *
 * @param linkPath - The link path from the contract (e.g., "./product-card")
 * @param baseContractDir - Directory of the contract containing the link
 * @param importResolver - Import resolver for path resolution
 */
export function getLinkedContractDir(
    linkPath: string,
    baseContractDir: string,
    importResolver: JayImportResolver,
): string {
    const linkWithExtension = linkPath.endsWith(JAY_CONTRACT_EXTENSION)
        ? linkPath
        : linkPath + JAY_CONTRACT_EXTENSION;

    try {
        const absolutePath = importResolver.resolveLink(baseContractDir, linkWithExtension);
        return path.dirname(absolutePath);
    } catch {
        return baseContractDir;
    }
}
