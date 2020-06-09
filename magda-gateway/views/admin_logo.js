addSection("Site Logo", async function (body) {
    const table = body.text("").append("table");

    let row = table.append("tr");
    row.append("th").text("item");
    row.append("th").style("width", "100%").text("value");

    row = table.append("tr");
    row.append("td").text("Full Logo");
    imageConfig(row.append("td").style("width", "100%"), "header/logo");

    row = table.append("tr");
    row.append("td").text("Mobile Logo");
    imageConfig(row.append("td"), "header/logo-mobile");
});

addSection("Favicon", async function (body) {
    body.append("h2").text("Favicon");

    const table = body.append("table");

    let row = table.append("tr");
    row.append("th").text("item");
    row.append("th").style("width", "100%").text("value");

    row = table.append("tr");
    row.append("td").text("Favicon");
    iconConfig(row.append("td"), "favicon.ico");
});
