import ts from 'typescript';
import { prettifyHtml } from '../utils/prettify';
import { astToCode } from '../ts-file/ts-compiler-utils';

export interface JsxBlockData {
    htmlFragments: string[];
    refs: ts.ArrowFunction[];
    memos: ts.Expression[];
    validations: string[];
}

export class JsxBlock {
    public readonly htmlFragments: string[] = [];
    public readonly refs: ts.ArrowFunction[] = [];
    public readonly memos: ts.Expression[] = [];
    public readonly validations: string[] = [];
    private cachedHtml: {
        html: string;
        length: number;
    };

    constructor({
        htmlFragments = [],
        refs = [],
        memos = [],
        validations = [],
    }: Partial<JsxBlockData> = {}) {
        this.htmlFragments = htmlFragments;
        this.refs = refs;
        this.memos = memos;
        this.validations = validations;
    }

    appendBlock(other: JsxBlock): void {
        if (other.htmlFragments.length > 0) this.htmlFragments.push(...other.htmlFragments);
        if (other.refs.length > 0) this.refs.push(...other.refs);
        if (other.memos.length > 0) this.memos.push(...other.memos);
        if (other.validations.length > 0) this.validations.push(...other.validations);
    }

    append(data: Partial<JsxBlockData>): JsxBlock {
        this.appendBlock(new JsxBlock(data));
        return this;
    }

    isValid(): boolean {
        return this.validations.length === 0;
    }

    getHtml(): string {
        if (this.cachedHtml?.length === this.htmlFragments.length) return this.cachedHtml.html;
        this.cachedHtml = {
            html: this.htmlFragments.join(''),
            length: this.htmlFragments.length,
        };
        return this.cachedHtml.html;
    }

    addHtml(html: string): void {
        this.htmlFragments.push(html);
    }

    addMemo(memo: ts.Expression): number {
        const memoCount = this.memos.length;
        this.memos.push(memo);
        return memoCount;
    }

    addRef(ref: ts.ArrowFunction): number {
        const refCount = this.refs.length;
        this.refs.push(ref);
        return refCount;
    }

    addValidation(validation: string): JsxBlock {
        this.validations.push(validation);
        return this;
    }

    data(): JsxBlockData {
        return {
            htmlFragments: this.htmlFragments,
            refs: this.refs,
            memos: this.memos,
            validations: this.validations,
        };
    }

    prettified(): {
        html: string;
        refs: string[];
        memos: string[];
        validations: string[];
    } {
        const html = this.getHtml();
        return {
            html: prettifyHtml(html),
            refs: this.refs.map((ref) => astToCode(ref)),
            memos: this.memos.map((memo) => astToCode(memo)),
            validations: this.validations,
        };
    }
}
