import toMatchStringIgnoringWhitespace from "./test/equal-with-compressed-whitespace";

expect.extend({
  toMatchStringIgnoringWhitespace: toMatchStringIgnoringWhitespace
});