import {SourceFileFormat} from "../compiler-shared/source-file-format";
import {JayType} from "../compiler-shared/jay-type";
import {JayExample} from "./jay-example";
import {HTMLElement} from "node-html-parser";
import {SourceFileType} from "../compiler-shared/source-file-type";

export interface JayHtmlSourceFile extends SourceFileType {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    examples: Array<JayExample>;
    body: HTMLElement;
}