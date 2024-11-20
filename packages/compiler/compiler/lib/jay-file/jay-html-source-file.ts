import {SourceFileFormat} from "../generation-utils/source-file-format";
import {JayType} from "../generation-utils/jay-type";
import {JayExample} from "./jay-example";
import {HTMLElement} from "node-html-parser";
import {SourceFileType} from "../generation-utils/source-file-type";

export interface JayHtmlSourceFile extends SourceFileType {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    examples: Array<JayExample>;
    body: HTMLElement;
}