export function encodeURIComponentWithApost(string: string) {
  return encodeURIComponent(string).replace("'", "%27");
}
