const name = transformer.getNameFromJsonOrganization(organization);
const jsonpath = libraries.jsonpath;
const phone = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].phone[*].CI_Telephone[*].voice[0].CharacterString[0]._"
);
const website = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].onlineResource[*].CI_OnlineResource[*].linkage[*].URL[0]._"
);
const email = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].electronicMailAddress[*].CharacterString[0]._"
);
const addrStreet = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].deliveryPoint[*].CharacterString[0]._"
);
const addrSuburb = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].city[*].CharacterString[0]._"
);
const addrState = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].administrativeArea[*].CharacterString[0]._"
);
const addrPostCode = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].postalCode[*].CharacterString[0]._"
);
let addrCountry = jsonpath.value(
    organization,
    "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].country[*].CharacterString[0]._"
);
if (!addrCountry) {
    addrCountry = jsonpath.value(
        organization,
        "$.contactInfo[*].CI_Contact[*].address[*].CI_Address[*].country[*].Country[0]._"
    );
}

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
    name: name,
    title: cleanOrgTitle(name),
    description: undefined,
    imageUrl: undefined,
    phone,
    email,
    addrStreet,
    addrSuburb,
    addrState,
    addrPostCode,
    addrCountry,
    website
};

Object.keys(data).forEach(key => {
    if (!data[key]) delete data[key];
});

return data;
