import { JayElement, element as e, dynamicText as dt } from 'jay-runtime';

interface ViewState {
  text: string;
  text2: string;
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, [
    e('div', {}, [dt(viewState, (vs) => vs.text)]),
    e('div', {}, ['static']),
    e('div', {}, [dt(viewState, (vs) => vs.text2)]),
  ]);
}
