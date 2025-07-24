;
import { JsxBlock } from '../jsx-block';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { isArrowFunction, isBinaryExpression, isJsxAttribute, isJsxExpression, isJsxSelfClosingElement, isStringLiteral } = tsModule;

export function parseOpeningElement(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    jsxBlock: JsxBlock = new JsxBlock(),
): JsxBlock {
    const tagName = node.tagName.getText();
    const attributeTexts = node.attributes.properties.map((attribute) =>
        parseAttribute(attribute, jsxBlock),
    );
    if (!jsxBlock.isValid()) return jsxBlock;

    const elementText = [
        '<',
        tagName,
        attributeTexts.length > 0 ? ' ' : '',
        attributeTexts.join(' '),
        isJsxSelfClosingElement(node) ? '/' : '',
        '>',
    ].join('');
    return jsxBlock.append({ htmlFragments: [elementText] });
}

function parseAttribute(attribute: ts.JsxAttributeLike, jsxBlock: JsxBlock): string | undefined {
    const key = attribute.name.getText();

    // TODO: support spread attributes
    if (!isJsxAttribute(attribute)) {
        jsxBlock.addValidation(`Unsupported spread attribute: ${attribute.getText()}`);
        return;
    }

    if (isStringLiteral(attribute.initializer)) {
        const value = attribute.initializer.getText();
        return `${key}=${value}`;
    }

    if (isJsxExpression(attribute.initializer)) {
        const expression = attribute.initializer.expression;
        if (isBinaryExpression(expression)) {
            return `${key}={_memo_${jsxBlock.addMemo(expression)}()}`;
        }

        if (isArrowFunction(expression)) {
            return `ref="_ref_${jsxBlock.addRef(expression)}"`;
        }
    }

    jsxBlock.addValidation(`Unsupported attribute: ${attribute.getText()}`);
}
