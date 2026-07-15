const ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
};
function esc(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ESCAPE_MAP[c]);
}

function wrap(cls: string, text: string): string {
    return `<span class="token ${cls}">${esc(text)}</span>`;
}

interface TokenRule {
    cls: string;
    re: RegExp;
}

const JS_KEYWORDS =
    /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|true|false|null|undefined)\b/;
const JS_RULES: TokenRule[] = [
    { cls: 'comment', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g },
    { cls: 'string', re: /`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g },
    { cls: 'keyword', re: new RegExp(JS_KEYWORDS.source, 'g') },
    { cls: 'number', re: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi },
    { cls: 'function', re: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g },
    { cls: 'operator', re: /[+\-*/%=!<>&|^~?:]+/g },
    { cls: 'punctuation', re: /[{}[\]();,.]/g },
];

const HTML_RULES: TokenRule[] = [
    { cls: 'comment', re: /<!--[\s\S]*?-->/g },
    { cls: 'tag', re: /<\/?[a-zA-Z][\w-]*/g },
    { cls: 'attribute', re: /\b[a-zA-Z-]+(?==)/g },
    { cls: 'string', re: /"[^"]*"|'[^']*'/g },
    { cls: 'punctuation', re: /[<>=/]/g },
];

const CSS_RULES: TokenRule[] = [
    { cls: 'comment', re: /\/\*[\s\S]*?\*\//g },
    { cls: 'string', re: /"[^"]*"|'[^']*'/g },
    { cls: 'keyword', re: /@[a-zA-Z-]+/g },
    { cls: 'number', re: /\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/g },
    { cls: 'function', re: /\b[a-zA-Z-]+(?=\()/g },
    { cls: 'punctuation', re: /[{}:;,()]/g },
];

const YAML_RULES: TokenRule[] = [
    { cls: 'comment', re: /#[^\n]*/g },
    { cls: 'string', re: /"[^"]*"|'[^']*'/g },
    { cls: 'keyword', re: /^[a-zA-Z_][\w-]*(?=\s*:)/gm },
    { cls: 'number', re: /\b\d+(?:\.\d+)?\b/g },
    { cls: 'punctuation', re: /[-:[\]{}|>]/g },
];

const JSON_RULES: TokenRule[] = [
    { cls: 'string', re: /"(?:[^"\\]|\\.)*"/g },
    { cls: 'number', re: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi },
    { cls: 'keyword', re: /\b(true|false|null)\b/g },
    { cls: 'punctuation', re: /[{}[\]:,]/g },
];

const BASH_RULES: TokenRule[] = [
    { cls: 'comment', re: /#[^\n]*/g },
    { cls: 'string', re: /"(?:[^"\\]|\\.)*"|'[^']*'/g },
    {
        cls: 'keyword',
        re: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|source|local|readonly|declare|set|unset|cd|echo|printf|test)\b/g,
    },
    { cls: 'function', re: /\b[a-zA-Z_][\w-]*(?=\s)/g },
    { cls: 'operator', re: /[|&;<>!$]+/g },
    { cls: 'punctuation', re: /[(){}[\]]/g },
];

const PYTHON_RULES: TokenRule[] = [
    { cls: 'comment', re: /#[^\n]*/g },
    { cls: 'string', re: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g },
    {
        cls: 'keyword',
        re: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None)\b/g,
    },
    { cls: 'number', re: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?j?\b/gi },
    { cls: 'function', re: /\b([a-zA-Z_]\w*)\s*(?=\()/g },
    { cls: 'operator', re: /[+\-*/%=!<>&|^~@:]+/g },
    { cls: 'punctuation', re: /[{}[\]();,.]/g },
];

const LANG_RULES: Record<string, TokenRule[]> = {
    javascript: JS_RULES,
    js: JS_RULES,
    typescript: JS_RULES,
    ts: JS_RULES,
    jsx: JS_RULES,
    tsx: JS_RULES,
    html: HTML_RULES,
    xml: HTML_RULES,
    css: CSS_RULES,
    scss: CSS_RULES,
    yaml: YAML_RULES,
    yml: YAML_RULES,
    json: JSON_RULES,
    bash: BASH_RULES,
    sh: BASH_RULES,
    shell: BASH_RULES,
    python: PYTHON_RULES,
    py: PYTHON_RULES,
};

export function highlightCode(code: string, lang: string): string {
    const rules = LANG_RULES[lang.toLowerCase()];
    if (!rules) return esc(code);

    const tokens: Array<{ start: number; end: number; cls: string; text: string }> = [];

    for (const rule of rules) {
        const re = new RegExp(rule.re.source, rule.re.flags);
        let match: RegExpExecArray | null;
        while ((match = re.exec(code)) !== null) {
            tokens.push({
                start: match.index,
                end: match.index + match[0].length,
                cls: rule.cls,
                text: match[0],
            });
        }
    }

    tokens.sort((a, b) => a.start - b.start || b.end - a.end);

    const result: string[] = [];
    let pos = 0;
    for (const token of tokens) {
        if (token.start < pos) continue;
        if (token.start > pos) result.push(esc(code.slice(pos, token.start)));
        result.push(wrap(token.cls, token.text));
        pos = token.end;
    }
    if (pos < code.length) result.push(esc(code.slice(pos)));

    return result.join('');
}
