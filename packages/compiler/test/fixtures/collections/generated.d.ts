import { JayElement } from 'jay-runtime';

interface Item {
  name: string;
  completed: boolean;
  cost: number;
  id: string;
}

interface ViewState {
  title: string;
  items: Array<Item>;
}

export declare function render(viewState: ViewState): JayElement<ViewState>;
