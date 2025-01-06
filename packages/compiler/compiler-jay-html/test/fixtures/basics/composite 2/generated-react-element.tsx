import { ReactElement } from 'react';
import { Jay4ReactElementProps } from 'jay-4-react';

export interface Composite2ViewState {
    title: string;
    subtitle: string;
    article: string;
}

export interface Composite2ElementRefs {}

export interface Composite2ElementProps extends Jay4ReactElementProps<Composite2ViewState> {}

export function render({
    vs,
    context,
}: Composite2ElementProps): ReactElement<Composite2ElementProps, any> {
    return (
        <div>
            <h1>{vs.title}</h1>
            <section>
                <div>{vs.subtitle}</div>
                <div>{vs.article}</div>
            </section>
        </div>
    );
}
