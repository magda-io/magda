const qs = require("querystring");

var set1 = ";,/?:@&=+$";
var set2 = "-_.!~*'()"; // Unescaped Characters
var set3 = "#"; // Number Sign
var set4 = "ABC abc 123"; // Alphanumeric Characters + Space
var set5 = "><|&#%"; // Alphanumeric Characters + Space
// --- The special characters ".", "-", "*", and remain the same.
// --- The special characters ".", "-", "*", and remain the same.
//--  ! ~  ' ( )
function formUrlencode(str) {
    return encodeURIComponent(str)
        .replace(/%20/g, "+")
        .replace(/[!~'()]/g, function (c) {
            return "%" + c.charCodeAt(0).toString(16);
        });
}

function formUrlencode2(s) {
    return encodeURIComponent(s)
        .replace(/\%0(?:D|d)(?=\%0(?:A|a))\%0(A|a)/g, "&")
        .replace(/\%0(?:D|d)/g, "&")
        .replace(/\%0(?:A|a)/g, "&")
        .replace(/\&/g, "%0D%0A")
        .replace(/\%20/g, "+");
}

console.log(encodeURIComponent(set1)); // %3B%2C%2F%3F%3A%40%26%3D%2B%24
console.log(encodeURIComponent(set2)); // -_.!~*'()
console.log(encodeURIComponent(set3)); // %23
console.log(encodeURIComponent(set4)); // ABC%20abc%20123 (the space gets encoded as %20)
console.log(encodeURIComponent(set5));

console.log("************* escape ******************");

console.log(qs.escape(set1)); // %3B%2C%2F%3F%3A%40%26%3D%2B%24
console.log(qs.escape(set2)); // -_.!~*'()
console.log(qs.escape(set3)); // %23
console.log(qs.escape(set4)); // ABC%20abc%20123 (the space gets encoded as %20)
console.log(qs.escape(set5));

console.log("*******************************");

console.log(
    qs.encode({
        aspectQuery: [
            "a.b.d.e:sds sdfsdf",
            "a.b.d.e:>sds sdfsdf",
            "a.b.d.e:!sds sdfsdf",
            "a.b.d.e:?%sds sdfsdf%",
            "a.b.d.e:>=sds sdfsdf%"
        ]
    })
);

console.log("*******************************");

console.log(
    qs.decode(
        "aspectQuery=a.b.d.e:sds%26 sdfsdf&aspectQuery=a.b.d.e:>sds sdfsdf&aspectQuery=a.b.d.e:!sds sdfsdf&aspectQuery=a.b.d.e:?%sds sdfsdf%&aspectQuery=a.b.d.e:>=sds sdfsd#f%"
    )
);
console.log("************* encodeURI ******************");

console.log(encodeURI(set1)); // %3B%2C%2F%3F%3A%40%26%3D%2B%24
console.log(encodeURI(set2)); // -_.!~*'()
console.log(encodeURI(set3)); // %23
console.log(encodeURI(set4)); // ABC%20abc%20123 (the space gets encoded as %20)
console.log(encodeURI(set5));

console.log("*********** formUrlencode ********************");

console.log(formUrlencode(set1)); // %3B%2C%2F%3F%3A%40%26%3D%2B%24
console.log(formUrlencode(set2)); // -_.!~*'()
console.log(formUrlencode(set3)); // %23
console.log(formUrlencode(set4)); // ABC%20abc%20123 (the space gets encoded as %20)
console.log(formUrlencode(set5));

console.log("*********** formUrlencode2 ********************");

console.log(formUrlencode2(set1)); // %3B%2C%2F%3F%3A%40%26%3D%2B%24
console.log(formUrlencode2(set2)); // -_.!~*'()
console.log(formUrlencode2(set3)); // %23
console.log(formUrlencode2(set4)); // ABC%20abc%20123 (the space gets encoded as %20)
console.log(formUrlencode2(set5));
