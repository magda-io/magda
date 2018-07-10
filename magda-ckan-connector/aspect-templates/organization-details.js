let phone = null;
let website = null;
let email = null;

if(organization && organization.extras && organization.extras.length){
    organization.extras.forEach(item=>{
        switch(item["key"]){
            case "email" : 
                email = item["value"];
                break;
            case "telephone" : 
                phone = item["value"];
                break;
            case "website" : 
                website = item["value"];
                break;
        }
    });
}

return {
    name: organization.name,
    title: organization.title,
    description: organization.description,
    imageUrl: organization.image_display_url || organization.image_url,
    phone,
    email,
    addrStreet : null,
    addrSuburb : null,
    addrState : null,
    addrPostCode : null,
    addrCountry : null,
    website
};
