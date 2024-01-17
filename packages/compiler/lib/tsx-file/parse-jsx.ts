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

export function parseJsx(expression: ts.Expression): JsxBlock {
    const jsxBlock = new JsxBlock();

    function visit(node: ts.Node) {
        if (!jsxBlock.isValid()) return;
        if (!SUPPORTED_JSX_NODES.has(node.kind)) {
            jsxBlock.validations.push(`Unsupported JSX node: ${node.getText()}`);
            return;
        }

        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
            jsxBlock.appendBlock(parseOpeningElement(node));

        if (ts.isJsxClosingElement(node))
            jsxBlock.append({ htmlFragments: [node.tagName.getText()] });

        ts.forEachChild(node, visit);
    }

    ts.forEachChild(expression, visit);
    return jsxBlock;
}
