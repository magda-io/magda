
const jsonpath = libraries.jsonpath;

let phone = null;
let website = null;
let email = jsonpath.value(organization, "$.contactPoint.hasEmail");
if(email) {
    email = String(email).trim().replace(/^mailto:/,"").trim();
}
if(!email) {
    email = null;
}
let addrStreet = null;
let addrSuburb = null;
let addrState = null;
let addrPostCode = null;
let addrCountry =null;

return {
    name: organization.name,
    title: organization.name,
    description: null,
    imageUrl: null,
    phone,
    email,
    addrStreet,
    addrSuburb,
    addrState,
    addrPostCode,
    addrCountry
};
