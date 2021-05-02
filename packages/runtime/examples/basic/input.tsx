interface ViewState {
  text: string;
}

export default function render(viewState: ViewState) {
  return <div>{viewState.text}</div>;
}
