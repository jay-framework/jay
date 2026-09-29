import fs from 'fs';
import path from 'path';
import {
    parseContract,
    compileContract,
    JAY_IMPORT_RESOLVER,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors, JAY_CONTRACT_EXTENSION } from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';

const IGNORED_DIRS = new Set(['node_modules', 'build', 'dist', '.git', '.cache']);

/**
 * Generates `<name>.jay-contract.d.ts` next to every `.jay-contract` under `root` (components,
 * plugins, nested locations, and page data contracts) — the type source a `.ts` imports from.
 *
 * Page data contracts are included: a page keeps both `page.jay-html.d.ts` (composed/free refs, the
 * interaction surface) and `page.jay-contract.d.ts` (data types + runtime enum values, imported by
 * `page.ts`). The two are not redundant — free refs (DL#198) and composed child refs exist only in
 * the jay-html d.ts, while runtime enum values can only come from the compiled contract module. See
 * DL#199.
 */
export async function generateContractDefinitionFiles(root: string): Promise<void> {
    const contractFiles = await collectContractFiles(root);

    for (const contractPath of contractFiles) {
        const definitionFilePath = contractPath + '.d.ts';

        // Skip if the definition file exists and is newer than the source.
        try {
            const [sourceStats, defStats] = await Promise.all([
                fs.promises.stat(contractPath),
                fs.promises.stat(definitionFilePath).catch(() => null),
            ]);
            if (defStats && defStats.mtime >= sourceStats.mtime) {
                continue;
            }
        } catch (error) {
            // If we can't check stats, continue with generation.
        }

        try {
            const code = await fs.promises.readFile(contractPath, 'utf-8');
            const filename = path.basename(contractPath);

            const parsed = parseContract(code, filename);
            const tsCode = await compileContract(parsed, contractPath, JAY_IMPORT_RESOLVER);

            if (tsCode.validations.length > 0) {
                getLogger().warn(
                    `failed to generate .d.ts for ${contractPath} with validation errors: ${tsCode.validations.join('\n')}`,
                );
                continue;
            }

            await fs.promises.writeFile(definitionFilePath, checkValidationErrors(tsCode), 'utf-8');
            getLogger().info(`📦 Generated contract definition file: ${definitionFilePath}`);
        } catch (error) {
            getLogger().error(`Failed to generate definition file for ${contractPath}: ${error}`);
        }
    }
}

/** Recursively collects `.jay-contract` files under `root`, skipping build/vendor directories. */
async function collectContractFiles(root: string): Promise<string[]> {
    const results: string[] = [];

    async function walk(dir: string): Promise<void> {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
                    continue;
                }
                await walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(JAY_CONTRACT_EXTENSION)) {
                results.push(fullPath);
            }
        }
    }

    await walk(root);
    return results;
}
