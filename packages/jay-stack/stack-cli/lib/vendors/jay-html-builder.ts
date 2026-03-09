import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { VendorConversionResult } from './types';

/**
 * Configuration for headless component
 */
export interface HeadlessComponent {
    plugin: string;
    contract: string;
    key: string;
}

/**
 * Options for building Jay HTML
 */
export interface JayHtmlBuildOptions {
    /**
     * The body HTML content from vendor conversion
     */
    bodyHtml: string;

    /**
     * Set of font family names to include
     */
    fontFamilies: Set<string>;

    /**
     * Optional contract data for jay-data script
     */
    contractData?: {
        name: string;
        tagsYaml: string;
    };

    /**
     * Path to an external .jay-contract file (e.g. './page.jay-contract').
     * When set, the script tag uses a contract attribute instead of inline data.
     */
    contractReference?: string;

    /**
     * List of headless components to include
     */
    headlessComponents?: HeadlessComponent[];

    /**
     * Page title (defaults to directory name)
     */
    title?: string;

    /**
     * Original `<style>` content to preserve from the source page.
     * When set, these styles are emitted in addition to the basic reset.
     */
    originalStyles?: string;

    /**
     * Original `<link>` tags to preserve from the source page (stylesheets, etc.)
     */
    originalLinkTags?: string[];
}

/**
 * Escapes HTML special characters for use in HTML content
 */
function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generates Google Fonts links for the collected font families
 */
function generateGoogleFontsLinks(fontFamilies: Set<string>): string {
    if (fontFamilies.size === 0) {
        return '';
    }

    const families = Array.from(fontFamilies).filter(
        (f) => !f.startsWith('var(') && !f.startsWith('--'),
    );
    if (families.length === 0) return '';
    const googleFontsUrl = `https://fonts.googleapis.com/css2?${families
        .map((family) => {
            const encodedFamily = encodeURIComponent(family).replace(/%20/g, '+');
            return `family=${encodedFamily}:wght@100;200;300;400;500;600;700;800;900`;
        })
        .join('&')}&display=swap`;

    return `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsUrl}" rel="stylesheet">`;
}

/**
 * Generates headless component script tags
 */
function generateHeadlessComponentScripts(components: HeadlessComponent[]): string {
    if (components.length === 0) {
        return '';
    }

    const scriptTags = components.map(
        (comp) =>
            `  <script
    type="application/jay-headless"
    plugin="${comp.plugin}"
    contract="${comp.contract}"
    key="${comp.key}"
  ></script>`,
    );

    return '\n' + scriptTags.join('\n');
}

/**
 * Generates the jay-data script tag.
 * Prefers an external contract reference over inline data when available.
 */
function generateJayDataScript(
    contractData?: { name: string; tagsYaml: string },
    contractReference?: string,
): string {
    if (contractReference) {
        return `  <script type="application/jay-data" contract="${contractReference}"></script>`;
    }

    if (contractData) {
        return `  <script type="application/jay-data">
    data:
${contractData.tagsYaml}
  </script>`;
    }

    return `  <script type="application/jay-data">
    data:
  </script>`;
}

/**
 * Builds a complete Jay HTML document from vendor conversion result and options
 */
export function buildJayHtml(options: JayHtmlBuildOptions): string {
    const {
        bodyHtml,
        fontFamilies,
        contractData,
        contractReference,
        headlessComponents = [],
        title = 'Page',
        originalStyles,
        originalLinkTags = [],
    } = options;

    const fontLinks = generateGoogleFontsLinks(fontFamilies);
    const headlessScripts = generateHeadlessComponentScripts(headlessComponents);
    const jayDataScript = generateJayDataScript(contractData, contractReference);
    const linkTagsBlock =
        originalLinkTags.length > 0 ? '\n' + originalLinkTags.map((t) => `  ${t}`).join('\n') : '';

    const styleBlock = originalStyles
        ? `  <style>\n${originalStyles}\n  </style>`
        : `  <style>
    /* Basic reset */
    body { margin: 0; font-family: sans-serif; }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }
    div { box-sizing: border-box; }
    
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.3); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.5); }
    * { scroll-behavior: smooth; }
  </style>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
${fontLinks}${headlessScripts}
${jayDataScript}${linkTagsBlock}
  <title>${escapeHtml(title)}</title>
${styleBlock}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Builds Jay HTML from vendor conversion result and page configuration
 * Reads page.conf.yaml from the page directory to include headless components
 */
export async function buildJayHtmlFromVendorResult(
    conversionResult: VendorConversionResult,
    pageDirectory: string,
    pageTitle?: string,
    usedComponents?: Array<{ appName: string; componentName: string; key: string }>,
): Promise<string> {
    // Read page.conf.yaml to get used components
    const pageConfigPath = path.join(pageDirectory, 'page.conf.yaml');
    const headlessComponents: HeadlessComponent[] = [];

    if (fs.existsSync(pageConfigPath)) {
        try {
            const configContent = await fs.promises.readFile(pageConfigPath, 'utf-8');
            const pageConfig = YAML.parse(configContent);

            if (pageConfig.used_components && Array.isArray(pageConfig.used_components)) {
                for (const comp of pageConfig.used_components) {
                    if (comp.plugin && comp.contract && comp.key) {
                        headlessComponents.push({
                            plugin: comp.plugin,
                            contract: comp.contract,
                            key: comp.key,
                        });
                    }
                }
            }
        } catch (configError) {
            console.warn(`Failed to read page config ${pageConfigPath}:`, configError);
        }
    }

    if (headlessComponents.length === 0 && usedComponents) {
        for (const comp of usedComponents) {
            headlessComponents.push({
                plugin: comp.appName,
                contract: comp.componentName,
                key: comp.key,
            });
        }
    }

    // Use directory name as default title if not provided
    const title = pageTitle || path.basename(pageDirectory);

    // Preserve external contract reference if page.jay-contract exists
    const contractFilePath = path.join(pageDirectory, 'page.jay-contract');
    const contractReference = fs.existsSync(contractFilePath) ? './page.jay-contract' : undefined;

    // Preserve original <style> and <link> content from existing page.jay-html
    let originalStyles: string | undefined;
    let originalLinkTags: string[] = [];
    const existingJayHtml = path.join(pageDirectory, 'page.jay-html');
    if (fs.existsSync(existingJayHtml)) {
        try {
            const content = fs.readFileSync(existingJayHtml, 'utf-8');
            const styleBlocks: string[] = [];
            const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
            let match;
            while ((match = styleRegex.exec(content)) !== null) {
                const inner = match[1].trim();
                if (inner) styleBlocks.push(inner);
            }
            if (styleBlocks.length > 0) {
                originalStyles = styleBlocks.join('\n\n');
            }

            const linkRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*\/?>/gi;
            let linkMatch;
            while ((linkMatch = linkRegex.exec(content)) !== null) {
                originalLinkTags.push(linkMatch[0].trim());
            }
        } catch {
            // ignore read errors
        }
    }

    return buildJayHtml({
        bodyHtml: conversionResult.bodyHtml,
        fontFamilies: conversionResult.fontFamilies,
        contractData: contractReference ? undefined : conversionResult.contractData,
        contractReference,
        headlessComponents,
        title,
        originalStyles,
        originalLinkTags,
    });
}
