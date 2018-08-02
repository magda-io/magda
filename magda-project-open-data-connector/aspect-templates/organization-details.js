const jsonpath = libraries.jsonpath;

let phone = undefined;
let website = undefined;
let email = jsonpath.value(organization, "$.contactPoint.hasEmail");
if (email) {
    email = String(email)
        .trim()
        .replace(/^mailto:/, "")
        .trim();
}
if (!email) {
    email = undefined;
}
let addrStreet = undefined;
let addrSuburb = undefined;
let addrState = undefined;
let addrPostCode = undefined;
let addrCountry = undefined;

function cleanOrgTitle(title) {
    if (!title) {
        return title;
    }
    if (typeof title !== "string") {
        title = String(title);
    }
    return title.replace(/^\W*/, "");
}

const data = {
    name: organization.name,
    title: cleanOrgTitle(organization.name),
    description: undefined,
    imageUrl: undefined,
    phone,
    email,
    addrStreet,
    addrSuburb,
    addrState,
    addrPostCode,
    addrCountry
};

Object.keys(data).forEach(key => {
    if (!data[key]) delete data[key];
});

return data;
