import { JayElement, element as e, dynamicText as dt } from 'jay-runtime';

interface ViewState {
  text1: string;
  text2: string;
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, [
    e('div', { style: { cssText: 'color:red' } }, [dt(viewState, (vs) => vs.text1)]),
    e('div', { style: { cssText: 'color:green' } }, [dt(viewState, (vs) => vs.text2)]),
  ]);
}
