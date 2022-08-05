export function h(element, properties, ...children) {
  return `${element} ${JSON.stringify(properties)} \n` + children.join('\n')
}

export const jayFile = <T>(props: T, ...children) => {
  return `...`
}