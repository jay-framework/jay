import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import {
    BooleanChoicesViewState,
    InterestOfBooleanChoicesViewState,
    OptionOfInterestOfBooleanChoicesViewState,
} from '../boolean-choices-headless/boolean-choices-headless.jay-contract';

export interface BooleanAttributesHeadlessViewState {
    ch?: BooleanChoicesViewState;
    title: string;
}

export function renderToStream(
    vs: BooleanAttributesHeadlessViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    w('<input');
    w(' type="checkbox"');
    if (vs.ch?.accepted) {
        w(' checked');
    }
    w(' jay-coordinate="S0/0/1" />');
    w('<input');
    w(' type="checkbox"');
    if (vs.ch?.accepted) {
        w(' checked');
    }
    w(' jay-coordinate="S0/0/2" />');
    w('<button');
    if (!vs.ch?.accepted) {
        w(' disabled');
    }
    w(' jay-coordinate="S0/0/3">');
    w('Send');
    w('</button>');
    w('<button');
    if (vs.ch?.accepted) {
        w(' disabled');
    }
    w(' jay-coordinate="S0/0/4">');
    w('Reset');
    w('</button>');
    for (const vs1 of vs.ch?.interests?.options ?? []) {
        w('<label');
        w(' jay-coordinate="S0/0/5">');
        w('<input');
        w(' type="checkbox"');
        if (vs1.selected) {
            w(' checked');
        }
        w(' jay-coordinate="S1/0" />');
        w('<input');
        w(' type="checkbox"');
        if (vs1.selected) {
            w(' checked');
        }
        w(' jay-coordinate="S1/1" />');
        w('<span');
        w(' jay-coordinate="S1/2">');
        w(escapeHtml(String(vs1.label)));
        w('</span>');
        w('</label>');
    }
    w('<select');
    w(' multiple');
    w(' jay-coordinate="S0/0/6">');
    for (const vs1 of vs.ch?.interests?.options ?? []) {
        w('<option');
        w(' value="' + escapeAttr(String(vs1.id)) + '"');
        if (vs1.selected) {
            w(' selected');
        }
        w(' jay-coordinate="S0/0/6/0">');
        w(escapeHtml(String(vs1.label)));
        w('</option>');
    }
    w('</select>');
    w('</div>');
}
