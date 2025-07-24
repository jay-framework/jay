;
import { parseOpeningElement } from './parse-opening-element';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { SyntaxKind, forEachChild, isJsxOpeningElement, isJsxSelfClosingElement, isJsxClosingElement, isJsxText, isJsxExpression } = tsModule;
import { JsxBlock } from '../jsx-block';

const SUPPORTED_JSX_NODES = new Set([
    SyntaxKind.ParenthesizedExpression,
    SyntaxKind.JsxText,
    SyntaxKind.JsxTextAllWhiteSpaces,
    SyntaxKind.JsxElement,
    SyntaxKind.JsxSelfClosingElement,
    SyntaxKind.JsxOpeningElement,
    SyntaxKind.JsxClosingElement,
    SyntaxKind.JsxFragment,
    SyntaxKind.JsxOpeningFragment,
    SyntaxKind.JsxClosingFragment,
    SyntaxKind.JsxAttribute,
    SyntaxKind.JsxAttributes,
    SyntaxKind.JsxSpreadAttribute,
    SyntaxKind.JsxExpression,
    SyntaxKind.JsxNamespacedName,
]);

export function parseJsx(
    expression: ts.Expression,
    { debug = false }: { debug?: boolean } = {},
): JsxBlock {
    const jsxBlock = new JsxBlock();

    function visit(node: ts.Node): void {
        if (!jsxBlock.isValid()) return;

        if (!SUPPORTED_JSX_NODES.has(node.kind)) {
            jsxBlock.validations.push(
                `Unsupported JSX node (kind ${node.kind}): ${node.getText()}`,
            );
            return;
        }

        if (debug) console.log(node.kind, node.getText(), jsxBlock.data());

        if (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) {
            parseOpeningElement(node, jsxBlock);
            return;
        }

        if (isJsxClosingElement(node)) {
            jsxBlock.addHtml(node.getText());
            return;
        }

        if (isJsxText(node)) {
            const trimmedText = node.getText().trim();
            trimmedText && jsxBlock.addHtml(trimmedText);
            return;
        }

        if (isJsxExpression(node)) {
            jsxBlock.addHtml(`{_memo_${jsxBlock.addMemo(node.expression)}()}`);
            return;
        }

        forEachChild(node, visit);
    }

    forEachChild(expression, visit);
    return jsxBlock;
}
