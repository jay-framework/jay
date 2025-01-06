import { ReactElement } from 'react';
import { Jay4ReactElementProps } from 'jay-4-react';

export interface AttributesViewState {
    text: string;
    text2: string;
    text3: string;
    bool1: boolean;
    color: string;
}

export interface AttributesElementRefs {}

export interface AttributesElementProps extends Jay4ReactElementProps<AttributesViewState> {}

export function render({
    vs,
    context,
}: AttributesElementProps): ReactElement<AttributesElementProps, any> {
    return (
        <div>
            <div style={{ background: 'red' }}>{vs.text}</div>
            <div data-attribute="a value">static</div>
            <input value="some value" />
            <input id="abc" value={vs.text2} />
            <input type="checkbox" checked={vs.bool1} value={vs.text2} />
            <label htmlFor="abc" />
            <div className="main second">{vs.text3}</div>
            <div className={vs.bool1 ? 'main' : ''}>{vs.text3}</div>
            <div className={vs.bool1 ? 'main' : 'second'}>{vs.text3}</div>
            <div data-attribute={vs.text} />
            <div data-attribute={`${vs.text}-abcd`} />
            <div data-attribute={`abcd-${vs.text}`} />
            <div data-attribute={`abcd-${vs.text}-abcd`} />
            <button disabled={vs.bool1} />
            <button disabled={!vs.bool1} />
            <button disabled />
        </div>
    );
}
