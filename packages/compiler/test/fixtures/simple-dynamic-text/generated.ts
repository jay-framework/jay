import { JayElement, element as e, dynamicText as dt } from 'jay-runtime';

interface ViewState {
  s1: string;
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, [dt(viewState, (vs) => vs.s1)]);
}
