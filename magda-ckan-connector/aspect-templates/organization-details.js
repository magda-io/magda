let phone = undefined;
let website = undefined;
let email = undefined;

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
        }
    });
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
    name: organization.name,
    title: cleanOrgTitle(organization.title),
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
