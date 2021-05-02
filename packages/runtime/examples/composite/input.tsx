interface ViewState {
  text: string;
  text2: string;
}

export default function render(viewState: ViewState) {
  return (
    <div>
      <div>{viewState.text}</div>
      <div>static</div>
      <div>{viewState.text2}</div>
    </div>
  );
}
