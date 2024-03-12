export default function (source) {
    return source.replace(/^#!.+$/m, "");
}
