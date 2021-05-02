interface ViewState {
  text1: string;
  text2: string;
  cond: boolean;
}

export default function render(viewState: ViewState) {
  return (
    <div>
      <div style="color:red" if={viewState.cond}>
        {viewState.text1}
      </div>
      <div style="color:green" if={!viewState.cond}>
        {viewState.text2}
      </div>
    </div>
  );
}
