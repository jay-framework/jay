import type { JayHtmlValidationContext, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import ts from 'typescript';
import { cssFirstWarning } from './findings.js';
import { matchesScrollRevealImport } from './scroll-reveal-libraries.js';

export function runScriptRules(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    if (!ctx.script) return [];

    const findings: JayHtmlValidationFinding[] = [];
    const sourceFile = ctx.script.sourceFile;
    const scriptPath = ctx.script.filePath;

    const visit = (node: ts.Node) => {
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

        if (ts.isCallExpression(node)) {
            const exprText = node.expression.getText(sourceFile);
            if (
                (exprText.endsWith('scrollIntoView') ||
                    exprText.endsWith('scrollTo') ||
                    exprText.endsWith('scrollBy')) &&
                node.arguments.some((arg) => arg.getText(sourceFile).includes('smooth'))
            ) {
                findings.push(
                    cssFirstWarning(
                        'allow-scripted-smooth-scroll',
                        'Smooth scrolling via JavaScript — prefer scroll-behavior: smooth',
                        'Add scroll-behavior: smooth with a prefers-reduced-motion guard',
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

    scanPresentationalHandlers(sourceFile, scriptPath, findings);
    scanTimerAnimation(sourceFile, scriptPath, findings);

    return findings;
}

function scanPresentationalHandlers(
    sourceFile: ts.SourceFile,
    scriptPath: string,
    findings: JayHtmlValidationFinding[],
): void {
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const text = node.expression.getText(sourceFile);
            if (text === 'addEventListener' && node.arguments.length >= 2) {
                const eventName = node.arguments[0].getText(sourceFile).replace(/['"]/g, '');
                if (eventName === 'scroll' || eventName === 'resize') {
                    if (handlerOnlyWritesPresentation(node.arguments[1], sourceFile)) {
                        findings.push(
                            cssFirstWarning(
                                'allow-presentational-scroll-handler',
                                `Scroll/resize handler only toggles classes or style — CSS can own this`,
                                'Try position: sticky or animation-timeline: scroll()',
                                {
                                    location: {
                                        file: scriptPath,
                                        line:
                                            sourceFile.getLineAndCharacterOfPosition(
                                                node.getStart(),
                                            ).line + 1,
                                    },
                                },
                            ),
                        );
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}

function handlerOnlyWritesPresentation(
    handler: ts.Expression,
    sourceFile: ts.SourceFile,
): boolean {
    const body =
        ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) ? handler.body : undefined;
    if (!body) return false;
    if (!ts.isBlock(body)) {
        return expressionOnlyPresentation(body, sourceFile);
    }
    if (body.statements.length === 0) return false;
    for (const statement of body.statements) {
        if (!statementIsPresentationOnly(statement, sourceFile)) return false;
    }
    return true;
}

function statementIsPresentationOnly(statement: ts.Statement, sourceFile: ts.SourceFile): boolean {
    if (ts.isExpressionStatement(statement)) {
        return expressionOnlyPresentation(statement.expression, sourceFile);
    }
    return false;
}

function expressionOnlyPresentation(expr: ts.Expression, sourceFile: ts.SourceFile): boolean {
    const text = expr.getText(sourceFile);
    if (text.includes('await ') || text.includes('fetch(')) return false;
    return (
        text.includes('classList') ||
        text.includes('.style') ||
        text.includes('getBoundingClientRect') ||
        text.includes('scrollY') ||
        text.includes('scrollTop')
    );
}

function scanTimerAnimation(
    sourceFile: ts.SourceFile,
    scriptPath: string,
    findings: JayHtmlValidationFinding[],
): void {
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(sourceFile);
            if (callee === 'setInterval' || callee === 'requestAnimationFrame') {
                const handler = node.arguments[0];
                if (handler && timerHandlerOnlyStyle(handler, sourceFile)) {
                    findings.push(
                        cssFirstWarning(
                            'allow-timer-animation',
                            'Timer animation writing inline styles — CSS transitions or @keyframes can replace this',
                            'Use transition or @keyframes instead of requestAnimationFrame for simple motion',
                            {
                                location: {
                                    file: scriptPath,
                                    line:
                                        sourceFile.getLineAndCharacterOfPosition(node.getStart())
                                            .line + 1,
                                },
                            },
                        ),
                    );
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}

function timerHandlerOnlyStyle(handler: ts.Expression, sourceFile: ts.SourceFile): boolean {
    const body =
        ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) ? handler.body : undefined;
    if (!body || !ts.isBlock(body) || body.statements.length !== 1) return false;
    const statement = body.statements[0];
    if (!ts.isExpressionStatement(statement)) return false;
    return statement.expression.getText(sourceFile).includes('.style');
}
