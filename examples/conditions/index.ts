import render from "./output";
import benchmark from '../benchmark';

window.onload = function() {
  let target = document.getElementById('target');
  let progress = document.getElementById('progress');
  let {dom, update} = render({text1: 'name', text2: 'name2', cond: true});
  target.appendChild(dom);

  benchmark(index => update({
    text1: 'name ' + index,
    text2: 'name ' + index * 2,
    cond: index % 2 === 0
  }), status => progress.textContent = status);
}