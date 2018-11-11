const cleanOrgTitle = libraries.cleanOrgTitle;

let phone = undefined;
let website = undefined;
let email = undefined;
let jurisdiction = undefined;

if (organization && organization.extras && organization.extras.length) {
    organization.extras.forEach(item => {
        switch (item["key"]) {
            case "email":
                email = item["value"];
                break;
            case "telephone":
                phone = item["value"];
                break;
            case "website":
                website = item["value"];
                break;
            case "jurisdiction":
                jurisdiction = item["value"];
                break;
        }
    });
}

const data = {
    name: organization.name,
    title: cleanOrgTitle(organization.title),
    jurisdiction,
    description: organization.description,
    imageUrl: organization.image_display_url || organization.image_url,
    phone,
    email,
    addrStreet: undefined,
    addrSuburb: undefined,
    addrState: undefined,
    addrPostCode: undefined,
    addrCountry: undefined,
    website
};

Object.keys(data).forEach(key => {
    if (!data[key]) delete data[key];
});

return data;
