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

/**
 * `<script type="application/jay-data">` carries YAML whose indentation is significant: neither the
 * line-collapse below nor js-beautify preserves its nesting, and collapsing it can even yield invalid
 * YAML. It is swapped out for a placeholder before formatting and restored verbatim afterwards. (Other
 * scripts hold JS that should be beautified; `<pre>`/`<textarea>` are already js-beautify defaults.)
 */
const JAY_DATA_SCRIPT = /<script\b[^>]*\btype\s*=\s*["']application\/jay-data["'][^>]*>[\s\S]*?<\/script\s*>/gi;
// An empty <script> placeholder (not an HTML comment) so js-beautify lays it out on its own line like
// the sibling jay-headless scripts, rather than gluing a comment onto the preceding tag.
const JAY_DATA_PLACEHOLDER = (i: number): string => `<script data-jay-data-raw="${i}"></script>`;
const JAY_DATA_PLACEHOLDER_RE = /<script data-jay-data-raw="(\d+)"><\/script>/g;

export function prettifyHtml(html: string): string {
    // Preserve jay-data YAML verbatim across formatting.
    const preserved: string[] = [];
    const withPlaceholders = html.replace(JAY_DATA_SCRIPT, (block) => {
        preserved.push(block);
        return JAY_DATA_PLACEHOLDER(preserved.length - 1);
    });

    // Collapse the author's line wrapping onto one line so js-beautify re-formats from a canonical form
    // (this keeps `prettifyHtml` a strong normalizer, which sync's string compare relies on). A naive
    // join('') welds the words on either side of a wrapped text node together
    // ("validate\nreports" → "validatereports"), because a newline inside a text node is significant HTML
    // whitespace that renders as one space. So insert a separating space ONLY where the wrap boundary sits
    // between two text characters; at any boundary touching a tag (prev char `>` or next char `<`) join
    // with nothing — a space there would inject significant inline whitespace between elements.
    let joined = '';
    for (const line of withPlaceholders.split('\n').map((l) => l.trim())) {
        if (line === '') continue;
        if (joined === '') {
            joined = line;
            continue;
        }
        const gap = joined[joined.length - 1] !== '>' && line[0] !== '<' ? ' ' : '';
        joined += gap + line;
    }

    const formatted = htmlBeautify(joined, {
        indent_size: 2,
        wrap_line_length: 100,
    });

    return formatted.replace(JAY_DATA_PLACEHOLDER_RE, (_match, i) => preserved[Number(i)] ?? _match);
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
