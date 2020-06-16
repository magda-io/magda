export default function readImage(src) {
    return new Promise((resolve, reject) => {
        var img = new Image();
        img.onload = function () {
            resolve(this);
        };
        img.onerror = reject;
        img.src = src;
    });
}
