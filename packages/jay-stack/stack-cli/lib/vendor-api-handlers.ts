/**
 * Vendor Handlers
 *
 * This module provides protocol handlers for the vendor design API.
 * It implements the export/import handlers that allow external editors
 * to send designs to Jay and retrieve them back for bi-directional sync.
 *
 * Uses the Editor Server Protocol (WebSocket-based) for communication.
 */

import path from 'path';
import fs from 'fs';
import { VendorAdapterRegistry } from './vendor-adapters';
import type {
    ExportMessage,
    ExportResponse,
    ImportMessage,
    ImportResponse,
} from '@jay-framework/editor-protocol';

/**
 * Create vendor protocol handlers
 */
export function createVendorHandlers(
    registry: VendorAdapterRegistry,
    pagesBasePath: string,
    projectRootPath: string,
) {
    /**
     * Convert page URL to file system path
     * Uses same logic as editor-handlers.ts
     */
    function pageUrlToDirectory(pageUrl: string): string {
        const routePath = pageUrl === '/' ? '' : pageUrl;
        return path.join(pagesBasePath, routePath);
    }

    /**
     * Handle vendor export requests
     *
     * Receives a vendor-specific document, saves it as the source of truth,
     * and converts it to jay-html
     */
    const onExport = async <TVendorDoc>(
        params: ExportMessage<TVendorDoc>,
    ): Promise<ExportResponse> => {
        try {
            const { vendorId, pageUrl, vendorDoc } = params;

            // Validate request
            if (!pageUrl || vendorDoc === undefined) {
                return {
                    type: 'export',
                    success: false,
                    error: 'Missing required fields: pageUrl and vendorDoc are required',
                };
            }

            // Get the adapter
            const adapter = registry.get(vendorId);
            if (!adapter) {
                return {
                    type: 'export',
                    success: false,
                    error: `No adapter found for vendor: ${vendorId}. Available vendors: ${registry.getVendorIds().join(', ')}`,
                };
            }

            // Determine file paths
            const pageDirectory = pageUrlToDirectory(pageUrl);
            const vendorSourcePath = path.join(pageDirectory, `page.${vendorId}.json`);
            const jayHtmlPath = path.join(pageDirectory, 'page.jay-html');
            const contractPath = path.join(pageDirectory, 'page.jay-contract');

            // Ensure directory exists
            await fs.promises.mkdir(pageDirectory, { recursive: true });

            // STEP 1: Save the vendor source file (source of truth)
            await fs.promises.writeFile(
                vendorSourcePath,
                JSON.stringify(vendorDoc, null, 2),
                'utf-8',
            );

            console.log(`💾 Saved ${vendorId} source: ${vendorSourcePath}`);

            // STEP 2: Convert to Jay using the adapter
            const conversionResult = await adapter.convert(vendorDoc, {
                pageDirectory,
                pageUrl: pageUrl,
                projectRoot: projectRootPath,
                pagesBase: pagesBasePath,
            });

            if (!conversionResult.success) {
                // Conversion failed, but we already saved the vendor source
                return {
                    type: 'export',
                    success: false,
                    vendorSourcePath,
                    error: `Conversion failed: ${conversionResult.error}`,
                };
            }

            // STEP 3: Write generated jay-html
            if (conversionResult.jayHtml) {
                await fs.promises.writeFile(jayHtmlPath, conversionResult.jayHtml, 'utf-8');
                console.log(`📝 Generated jay-html: ${jayHtmlPath}`);
            }

            // STEP 4: Write contract if generated
            let savedContractPath: string | undefined;
            if (conversionResult.contract) {
                await fs.promises.writeFile(contractPath, conversionResult.contract, 'utf-8');
                savedContractPath = contractPath;
                console.log(`📋 Generated contract: ${contractPath}`);
            }

            // Success!
            return {
                type: 'export',
                success: true,
                vendorSourcePath,
                jayHtmlPath: conversionResult.jayHtml ? jayHtmlPath : undefined,
                contractPath: savedContractPath,
                warnings: conversionResult.warnings,
            };
        } catch (error) {
            console.error('Export error:', error);
            return {
                type: 'export',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    /**
     * Handle vendor import requests
     *
     * Retrieves the vendor source document for a given page
     */
    const onImport = async <TVendorDoc>(
        params: ImportMessage<TVendorDoc>,
    ): Promise<ImportResponse<TVendorDoc>> => {
        try {
            const { vendorId, pageUrl } = params;

            // Validate request
            if (!pageUrl) {
                return {
                    type: 'import',
                    success: false,
                    error: 'Missing required field: pageUrl',
                };
            }

            // Check if adapter exists (optional validation)
            if (!registry.has(vendorId)) {
                return {
                    type: 'import',
                    success: false,
                    error: `No adapter found for vendor: ${vendorId}. Available vendors: ${registry.getVendorIds().join(', ')}`,
                };
            }

            // Determine file path
            const pageDirectory = pageUrlToDirectory(pageUrl);
            const vendorSourcePath = path.join(pageDirectory, `page.${vendorId}.json`);

            // Check if file exists
            if (!fs.existsSync(vendorSourcePath)) {
                return {
                    type: 'import',
                    success: false,
                    error: `No ${vendorId} source file found for page: ${pageUrl}`,
                };
            }

            // Read and parse the vendor source file
            const vendorDocContent = await fs.promises.readFile(vendorSourcePath, 'utf-8');
            const vendorDoc = JSON.parse(vendorDocContent);

            console.log(`📥 Retrieved ${vendorId} source: ${vendorSourcePath}`);

            // Success!
            return {
                type: 'import',
                success: true,
                vendorDoc,
            };
        } catch (error) {
            console.error('Import error:', error);
            return {
                type: 'import',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    return {
        onExport,
        onImport,
    };
}
