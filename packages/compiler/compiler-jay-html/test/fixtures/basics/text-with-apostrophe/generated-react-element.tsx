import { ReactElement } from 'react';
import { Jay4ReactElementProps } from 'jay-4-react';

export interface TextWithApostropheViewState {
    s1: string;
}

export interface TextWithApostropheElementRefs {}

export interface TextWithApostropheElementProps
    extends Jay4ReactElementProps<TextWithApostropheViewState> {}

export function render({
    vs,
    context,
}: TextWithApostropheElementProps): ReactElement<TextWithApostropheElementProps, any> {
    return <div>static text's</div>;
}
