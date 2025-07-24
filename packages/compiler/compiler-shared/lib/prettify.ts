import * as prettier from 'prettier';
import jsBeautify from 'js-beautify';
const { html: htmlBeautify } = jsBeautify;

export async function prettify(code: string, options: prettier.Options = {}): Promise<string> {
    // same format as global .prettierrc
    try {
        return await prettier.format(code, {
            printWidth: 100,
            singleQuote: true,
            tabWidth: 4,
            parser: 'typescript',
            ...options,
        });
        // .split("\n")
        // .filter(line => line.trim())  // Remove empty lines
        // .join("\n");
    } catch (error) {
        throw new Error(`failed to prettify code
original error: ${error.message}
code:
${code}`);
    }
}

export function prettifyHtml(html: string): string {
    return htmlBeautify(
        html
            .split('\n')
            .map((line) => line.trim())
            .join(''),
        {
            indent_size: 2,
            wrap_line_length: 100,
        },
    );
}

export function removeComments(code: string): string {
    return code
        .split('\n')
        .filter(
            (line) =>
                !(
                    line.includes('// @ts-expect-error ') ||
                    line.includes('// @ts-ignore') ||
                    line.includes('{/* @ts-ignore */}')
                ),
        )
        .join('\n');
}
