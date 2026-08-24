import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
    JAY_EXTENSION,
    type JayHtmlValidationContext,
    type JayHtmlValidationFinding,
    type JayHtmlValidatorFn,
} from '@jay-framework/compiler-shared';
import {
    JAY_IMPORT_RESOLVER,
    parseJayFile,
    type JayHtmlSourceFile,
} from '@jay-framework/compiler-jay-html';

import { validateComponents } from './validators/design-components.js';
import { validateContrast } from './validators/design-contrast.js';
import { validateStructure } from './validators/design-structure.js';
import { validateTokens } from './validators/design-tokens.js';

export type DesignAnalysisFinding = {
    file: string;
    validator: string;
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
};

export type DesignAnalysisResult = {
    filesScanned: number;
    findings: DesignAnalysisFinding[];
    errorCount: number;
    warningCount: number;
};

const DESIGN_VALIDATORS: Array<{ name: string; run: JayHtmlValidatorFn }> = [
    { name: 'design-tokens', run: validateTokens },
    { name: 'design-components', run: validateComponents },
    { name: 'design-structure', run: validateStructure },
    { name: 'design-contrast', run: validateContrast },
];

async function findJayHtmlFiles(scanDir: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                entry.name !== 'node_modules'
            ) {
                await walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(JAY_EXTENSION)) {
                files.push(fullPath);
            }
        }
    }

    await walk(scanDir);
    return files;
}

function toAnalysisFinding(
    relativePath: string,
    validator: string,
    finding: JayHtmlValidationFinding,
): DesignAnalysisFinding | null {
    if (!finding.message) return null;
    return {
        file: relativePath,
        validator,
        severity: finding.severity === 'error' ? 'error' : 'warning',
        message: finding.message,
        suggestion: finding.suggestion,
    };
}

function buildValidationContext(
    projectRoot: string,
    relativePath: string,
    parsed: JayHtmlSourceFile,
): JayHtmlValidationContext {
    return {
        filePath: relativePath,
        body: parsed.body,
        css: parsed.css,
        head: parsed.headMeta,
        headlessImports: parsed.headlessImports.map((imp) => ({
            key: imp.key,
            contractName: imp.contractName,
            contract: imp.contract
                ? {
                      name: imp.contract.name,
                      tags: imp.contract.tags as NonNullable<
                          JayHtmlValidationContext['contract']
                      >['tags'],
                      props: imp.contract.props as NonNullable<
                          JayHtmlValidationContext['contract']
                      >['props'],
                      params: imp.contract.params as NonNullable<
                          JayHtmlValidationContext['contract']
                      >['params'],
                  }
                : undefined,
        })),
        projectRoot,
    };
}

export async function runDesignSystemAnalysis(projectRoot: string): Promise<DesignAnalysisResult> {
    const pagesDir = path.join(projectRoot, 'src', 'pages');
    const componentsDir = path.join(projectRoot, 'src', 'components');

    const jayHtmlFiles = [
        ...(await findJayHtmlFiles(pagesDir).catch(() => [])),
        ...(await findJayHtmlFiles(componentsDir).catch(() => [])),
    ];

    const findings: DesignAnalysisFinding[] = [];

    for (const jayHtmlPath of jayHtmlFiles) {
        const relativePath = path.relative(projectRoot, jayHtmlPath);
        const filename = path.basename(jayHtmlPath.replace(JAY_EXTENSION, ''));
        const dirname = path.dirname(jayHtmlPath);

        let parsed: JayHtmlSourceFile;
        try {
            const content = await fsp.readFile(jayHtmlPath, 'utf-8');
            const parseResult = await parseJayFile(
                content,
                filename,
                dirname,
                {},
                JAY_IMPORT_RESOLVER,
                projectRoot,
            );
            if (!parseResult.value) continue;
            parsed = parseResult.value;
        } catch {
            continue;
        }

        const ctx = buildValidationContext(projectRoot, relativePath, parsed);

        for (const validator of DESIGN_VALIDATORS) {
            const validatorFindings = await Promise.resolve(validator.run(ctx));
            for (const finding of validatorFindings) {
                const mapped = toAnalysisFinding(relativePath, validator.name, finding);
                if (mapped) findings.push(mapped);
            }
        }
    }

    const errorCount = findings.filter((finding) => finding.severity === 'error').length;
    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;

    return {
        filesScanned: jayHtmlFiles.length,
        findings,
        errorCount,
        warningCount,
    };
}
