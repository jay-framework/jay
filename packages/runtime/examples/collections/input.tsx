interface Item {
  name: string;
  completed: boolean;
  cost: number;
  id: string;
}

interface ViewState {
  items: Array<Item>;
  title: string;
}

export default function render(viewState: ViewState) {
  return (
    <div>
      <h1>{viewState.title}</h1>
      <div>
        <div forEach={viewState.items} item={item} trackBy={item.id}>
          <span style="color:green; width: 100px; display: inline-block;">{item.name}</span>
          <span style="color:red; width: 100px; display: inline-block;">{item.completed}</span>
          <span style="color:blue; width: 100px; display: inline-block;">{item.cost}</span>
        </div>
      </div>
    </div>
  );
}
