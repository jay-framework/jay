import { JayFormat, JayUnknown, parseTypeScriptFile, WithValidations } from '../../lib';

describe('parseJayTypeScriptFile', () => {
    const filePath = '/root/source/app.jay-html.ts';
    const code = `
import {
    JayElement,
    element as e,
    ConstructContext,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { mainRoot as mr, secureChildComp } from 'jay-secure';
import { CounterRef } from './counter-refs';
import { Counter } from './counter?jay-mainSandbox';

export interface AppViewState {
    incrementBy: number;
}

export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            mr(viewState, () =>
                e('div', {}, [
                    e(
                        'input',
                        { type: 'number', id: 'interval', name: 'increment', min: '1', max: '100' },
                        [],
                    ),
                    secureChildComp(
                        Counter,
                        (vs: AppViewState) => ({ initialValue: 12, incrementBy: vs.incrementBy }),
                        cr('a'),
                    ),
                ]),
            ),
        options,
    );
}`;

    it('returns a JayFile', () => {
        expect(parseTypeScriptFile(filePath, code)).toEqual(
            new WithValidations(
                {
                    format: JayFormat.TypeScript,
                    imports: [
                        {
                            module: 'jay-runtime',
                            names: [
                                { name: 'JayElement', type: JayUnknown },
                                { as: 'e', name: 'element', type: JayUnknown },
                                { name: 'ConstructContext', type: JayUnknown },
                                { as: 'cr', name: 'compRef', type: JayUnknown },
                                { name: 'RenderElementOptions', type: JayUnknown },
                            ],
                            sandbox: false,
                        },
                        {
                            module: 'jay-secure',
                            names: [
                                { as: 'mr', name: 'mainRoot', type: JayUnknown },
                                { name: 'secureChildComp', type: JayUnknown },
                            ],
                            sandbox: false,
                        },
                        {
                            module: './counter-refs',
                            names: [{ name: 'CounterRef', type: JayUnknown }],
                            sandbox: false,
                        },
                        {
                            module: './counter?jay-mainSandbox',
                            names: [{ name: 'Counter', type: JayUnknown }],
                            sandbox: true,
                        },
                    ],
                    baseElementName: 'App',
                },
                [],
            ),
        );
    });
});
