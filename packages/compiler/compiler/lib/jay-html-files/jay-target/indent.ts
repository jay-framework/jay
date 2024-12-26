export class Indent {
    private readonly base: string;
    readonly firstLineBreak: boolean;
    readonly lastLineIndent: boolean;

    constructor(parent: string, firstLineBreak = true, lastLineIndent = false) {
        this.base = parent;
        this.firstLineBreak = firstLineBreak;
        this.lastLineIndent = lastLineIndent;
    }

    get firstLine(): string {
        return this.firstLineBreak ? this.base : '';
    }

    get curr(): string {
        return this.base + '  ';
    }

    get lastLine(): string {
        return this.lastLineIndent ? this.base : '';
    }

    child(): Indent {
        return new Indent(this.base + '  ');
    }

    noFirstLineBreak() {
        return new Indent(this.base, false);
    }

    withFirstLineBreak() {
        return new Indent(this.base, true);
    }

    withLastLineBreak() {
        return new Indent(this.base, false, true);
    }

    static forceIndent(code: string, size: number = 2) {
        let indent = '';
        for (let i = 0; i < size; i++) indent += ' ';
        return code
            .split('\n')
            .map((_) => (_.length > 0 ? indent + _ : _))
            .join('\n');
    }
}