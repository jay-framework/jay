import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface StyleBindingsViewState {
    text: string;
    color: string;
    width: string;
    fontSize: number;
}

export function renderToStream(vs: StyleBindingsViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<div');
    w(' style="' + escapeAttr(String(`color: ${vs.color}; width: ${vs.width}`)) + '"');
    w(' jay-coordinate="0/0">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(' style="' + escapeAttr(String(`margin: 10px; color: ${vs.color}; padding: 20px`)) + '"');
    w(' jay-coordinate="0/1">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(
        ' style="' +
            escapeAttr(String(`background-color: ${vs.color}; font-size: ${vs.fontSize}px`)) +
            '"',
    );
    w(' jay-coordinate="0/2">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(' style="background: red; padding: 10px"');
    w(' jay-coordinate="0/3">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(
        ' style="position: relative;width: fit-content;height: 24px;background: linear-gradient(rgba(255, 255, 255, 1), rgba(255, 255, 255, 1)); background-size: 100% 100%; background-position: center; background-repeat: no-repeat;border-color: rgb(223, 229, 235); border-width: 1px 1px 1px 1px; box-sizing: border-box; border-style: solid; /* stroke-linejoin: miter; (SVG only) */ /* stroke-miterlimit: 4; (SVG only) */border-radius: 6px;overflow: hidden;;box-sizing: border-box;display: flex;flex-direction: row;justify-content: center;align-items: center;gap: 8px;padding-left: 12px;padding-right: 12px;padding-top: 4px;padding-bottom: 4px;"',
    );
    w(' jay-coordinate="0/4">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('</div>');
}
