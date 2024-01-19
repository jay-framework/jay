import * as ts from 'typescript';
import { parseOpeningElement } from './parse-opening-element';
import { JsxBlock } from './jsx-block';

const SUPPORTED_JSX_NODES = new Set([
    ts.SyntaxKind.ParenthesizedExpression,
    ts.SyntaxKind.JsxText,
    ts.SyntaxKind.JsxTextAllWhiteSpaces,
    ts.SyntaxKind.JsxElement,
    ts.SyntaxKind.JsxSelfClosingElement,
    ts.SyntaxKind.JsxOpeningElement,
    ts.SyntaxKind.JsxClosingElement,
    ts.SyntaxKind.JsxFragment,
    ts.SyntaxKind.JsxOpeningFragment,
    ts.SyntaxKind.JsxClosingFragment,
    ts.SyntaxKind.JsxAttribute,
    ts.SyntaxKind.JsxAttributes,
    ts.SyntaxKind.JsxSpreadAttribute,
    ts.SyntaxKind.JsxExpression,
    ts.SyntaxKind.JsxNamespacedName,
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

        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            parseOpeningElement(node, jsxBlock);
            return;
        }

        if (ts.isJsxClosingElement(node)) {
            jsxBlock.addHtml(node.getText());
            return;
        }

        if (ts.isJsxText(node)) {
            const trimmedText = node.getText().trim();
            trimmedText && jsxBlock.addHtml(trimmedText);
            return;
        }

        if (ts.isJsxExpression(node)) {
            jsxBlock.addHtml(`{_memo_${jsxBlock.addMemo(node.expression)}()}`);
            return;
        }

        ts.forEachChild(node, visit);
    }

    ts.forEachChild(expression, visit);
    return jsxBlock;
}
