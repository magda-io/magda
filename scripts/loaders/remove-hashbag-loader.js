module.exports = function (source) {
    return source.replace(/^#!.+$/m, "");
};
