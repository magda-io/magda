export default function compose(f, g) {
    return function (x) {
        return f(g(x));
    };
}
