import render from './output';

export default {
  render,
  data,
};

function data() {
  return function (index) {
    if (index === 0) return { text1: 'name', text2: 'name2', cond: true };
    else
      return {
        text1: 'name ' + index,
        text2: 'name ' + index * 2,
        cond: index % 2 === 0,
      };
  };
}
