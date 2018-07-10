const name = transformer.getNameFromJsonOrganization(organization);
const jsonpath = libraries.jsonpath;
let phone = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].phone[*].CI_Telephone[*].voice[0].CharacterString[0]._");
let website = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].onlineResource[*].CI_OnlineResource[*].linkage[*].URL[0]._");
let email = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].electronicMailAddress[*].CharacterString[0]._");
let addrStreet = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].deliveryPoint[*].CharacterString[0]._");
let addrSuburb = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].city[*].CharacterString[0]._");
let addrState = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].administrativeArea[*].CharacterString[0]._");
let addrPostCode = jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].postalCode[*].CharacterString[0]._");
let addrCountry =jsonpath.value(organization,"$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].country[*].Country[0]._");

const data = {
    name: name,
    title: name,
    description: null,
    imageUrl: null,
    phone,
    email,
    addrStreet,
    addrSuburb,
    addrState,
    addrPostCode,
    addrCountry,
    website
};

Object.keys(data).forEach(key=>{
    if(typeof data[key] === "undefined") data[key] = null;
});

return data;