import { element as e, dynamicText as dt } from '../../lib/element';

interface ViewState {
  text: string;
  text2: string;
}

export default function render(viewState: ViewState) {
  return e('div', {}, [
    e('div', {}, [dt(viewState, (vs) => vs.text)]),
    e('div', {}, ['static']),
    e('div', {}, [dt(viewState, (vs) => vs.text2)]),
  ]);
}
