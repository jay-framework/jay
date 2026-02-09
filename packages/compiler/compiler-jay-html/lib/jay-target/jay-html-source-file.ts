import { JayImportLink, RefsTree, SourceFileFormat } from '@jay-framework/compiler-shared';
import { JayType } from '@jay-framework/compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { CompilerSourceFile } from '@jay-framework/compiler-shared';
import { Contract } from '../contract';

export interface JayHtmlNamespace {
    prefix: string;
    namespace: string;
}

export interface JayHeadlessImports {
    key: string;
    refs: RefsTree;
    rootType: JayType;
    contractLinks: JayImportLink[];
    codeLink: JayImportLink;
    contract?: Contract; // The loaded contract for this headless component
    contractPath?: string; // Absolute path to the contract file (for resolving linked sub-contracts)
    metadata?: Record<string, unknown>; // Optional metadata from dynamic contract generator
}

export interface JayHtmlHeadLink {
    rel: string;
    href: string;
    attributes: Record<string, string>;
}

export interface JayHtmlSourceFile extends CompilerSourceFile {
    format: SourceFileFormat.JayHtml;
    baseElementName: string;
    types: JayType;
    body: HTMLElement;
    namespaces: JayHtmlNamespace[];
    headlessImports: JayHeadlessImports[];
    headLinks: JayHtmlHeadLink[];
    css?: string;
    /**
     * Absolute paths to linked CSS files referenced via <link rel="stylesheet">.
     * Used by the dev server to watch these files for changes.
     */
    linkedCssFiles?: string[];
    filename?: string;
    contract?: Contract; // The parsed contract if using contract reference
    contractRef?: string; // Path to contract file if using contract reference
    hasInlineData?: boolean; // True if using inline data structure
    /**
     * TrackBy map for server-side merge (slow → fast).
     * Includes all tracked arrays.
     */
    serverTrackByMap?: Record<string, string>;
    /**
     * TrackBy map for client-side merge (fast → interactive).
     * Excludes arrays with phase 'fast+interactive' (dynamic arrays that can be fully replaced).
     */
    clientTrackByMap?: Record<string, string>;
}
