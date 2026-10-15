import type { JayHtmlValidationContext, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { ts, type TypeScript } from '@jay-framework/typescript-bridge';
import { cssFirstWarning } from './findings.js';
import { matchesScrollRevealImport } from './scroll-reveal-libraries.js';

export function runScriptRules(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    if (!ctx.script) return [];

    const findings: JayHtmlValidationFinding[] = [];
    const sourceFile = ctx.script.sourceFile;
    const scriptPath = ctx.script.filePath;

    const visit = (node: TypeScript.Node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            if (matchesScrollRevealImport(node.moduleSpecifier.text)) {
                findings.push(
                    cssFirstWarning(
                        'allow-scroll-reveal-library',
                        `Scroll-reveal import "${node.moduleSpecifier.text}"`,
                        'Use @keyframes + animation-timeline: view()',
                        {
                            location: {
                                file: scriptPath,
                                line:
                                    sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
                                    1,
                            },
                        },
                    ),
                );
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    return findings;
}
