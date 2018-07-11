export function encodeURIComponentWithApost(string: string) {
    return encodeURIComponent(string).replace(/'/g, "%27");
}
