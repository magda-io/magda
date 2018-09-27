const instanceURL = "/api/v0";

window.onload = function() {
    refresh();
};

async function refresh() {
    const body = d3.select("#body").text("Loading...");

    try {
        const me = await request("GET", `${instanceURL}/auth/users/whoami`);
        body.text("");

        if (!me.isAdmin) {
            body.append("P").text(
                `Hi ${me.displayName}, you are not an admin!`
            );
            return;
        }

        showMe(body.append("div"), me);

        showConfig(body.append("div"));

        showSpreadsheets(body.append("div"));

        showConnectors(body.append("div"));
    } catch (e) {
        body.append("pre").text(e);

        body.append("p").html(
            `Are you logged in? Try <a href="${instanceURL.substr(
                0,
                instanceURL.indexOf("/", 9)
            )}/auth">here</a>.`
        );

        console.error(e.stack);
    }
}

function showConfig(body) {
    body.append("h2").text("Configuration");

    const table = body.append("table");

    let row = table.append("tr");
    row.append("th").text("item");
    row.append("th")
        .style("width", "100%")
        .text("value");

    row = table.append("tr");
    row.append("td").text("Full Logo");
    imageConfig(row.append("td").style("width", "100%"), "logo");

    row = table.append("tr");
    row.append("td").text("Mobile Logo");
    imageConfig(row.append("td"), "logo-mobile");
}

function showMe(body, me) {
    body.append("h2").text("User");
    body.append("pre").text(JSON.stringify(me, null, 2));
}

function imageConfig(body, name) {
    body.append("img")
        .attr("src", `${instanceURL}/content/${name}.bin`)
        .style("max-height", `70px`)
        .style("max-width", `367px`);

    body.append("button")
        .text("Change")
        .on("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.click();
            input.onchange = function() {
                const file = input.files[0];
                const fileReader = new FileReader();
                fileReader.onloadend = async function(e) {
                    const data = new Blob([new Uint8Array(e.target.result)]);
                    await request(
                        "POST",
                        `${instanceURL}/content/${name}`,
                        data,
                        file.type
                    );
                    alert("DONE");
                    window.location = window.location;
                };
                fileReader.readAsArrayBuffer(file);
            };
        });

    return body;
}

function request(method, url, body = null, contentType = undefined) {
    const headers = {};
    if (contentType) {
        headers["Content-Type"] = contentType;
    }
    if (contentType === "application/json") {
        body = JSON.stringify(body);
    }
    const mode = "cors";
    const credentials = "include";
    return d3.json(url, { method, headers, body, mode, credentials });
}

function spreadsheetConfig(body) {
    body.append("label").text("ID:");
    const inputName = body.append("input").attr("value", "demo");
    body.append("button")
        .text("Upload")
        .on("click", () => {
            let name = inputName.property("value");
            name =
                name &&
                name
                    .replace(/[^a-z0-9]/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/(^-+|-+$)/g, "");
            if (!name) {
                return;
            }
            name = `csv-${name}`;
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "*.csv;*.xls;*.xlsx";
            input.click();
            input.onchange = function() {
                const file = input.files[0];
                const fileReader = new FileReader();
                fileReader.onloadend = async function(e) {
                    const data = new Blob([new Uint8Array(e.target.result)]);
                    await request(
                        "POST",
                        `${instanceURL}/content/${name}`,
                        data,
                        file.type
                    );
                    alert("DONE");
                    window.location = window.location;
                };
                fileReader.readAsArrayBuffer(file);
            };
        });

    return body;
}

async function showSpreadsheets(body) {
    body.text("Loading...");

    let connectors = await request("GET", "/api/v0/admin/connectors");
    let files = await request("GET", "/api/v0/content/all");
    files = files.filter(x => x.id.match(/^csv-/));

    body.text("");

    body.append("h2").text("Spreadsheets");

    if (files.length > 0) {
        const table = body.append("table");
        let row = table.append("tr");
        row.append("th").text("name");
        row.append("th").text("type");
        row.append("th").text("ops");

        for (const file of files) {
            row = table.append("tr");
            row.append("td").text(file.id.substr(4));
            row.append("td").text(file.type);
            let td = row.append("td");

            td.append("button")
                .text("Delete")
                .on("click", deleteContent.bind(null, file.id));

            if (
                connectors.filter(connector => connector.id === file.id)
                    .length === 0
            ) {
                td.append("button")
                    .text("Create Connector")
                    .on("click", createConnector.bind(null, file.id));
            }
        }
    } else {
        body.append("P").text("You got none!");
    }

    body.append("H3").text("Upload new");

    spreadsheetConfig(body);
}

async function deleteContent(name) {
    console.log(
        "DONE",
        name,
        await request("DELETE", `/api/v0/content/${name}`)
    );
}

async function createConnector(name) {
    let sourceUrl = window.location.toString();
    sourceUrl = sourceUrl.substr(0, sourceUrl.indexOf("/", 8));
    sourceUrl += `/api/v0/content/${name}.bin`;

    const body = {
        id: name,
        image: {
            name: "magda-csv-connector"
        },
        name: name,
        sourceUrl: sourceUrl
    };

    const job = await request(
        "PUT",
        `/api/v0/admin/connectors/${name}`,
        body,
        "application/json"
    );

    console.log("DONE", job);

    alert(`ADDED ${name}!!`);
}

function showConnectors(body) {
    body.text("Loading...");

    async function refresh() {
        let connectors = await request("GET", "/api/v0/admin/connectors");
        body.text("");
        body.append("h2").text("Connectors");

        let running = false;

        if (connectors.length > 0) {
            const table = body.append("table");

            let row = table.append("tr");
            row.append("th").text("name");
            row.append("th").text("status");

            row.append("th").text("url");
            row.append("th").text("type");
            row.append("th").text("ops");

            //row.append('th').text('id');

            for (const connector of connectors) {
                row = table.append("tr");
                row.append("td").text(connector.name);

                let status = (connector.job && connector.job.status) || "none";

                row.append("td").text(status);

                running = running || status === "active";

                row.append("td").text(connector.sourceUrl);
                row.append("td").text(
                    connector.image.name.replace(/(^magda-|-connector)/g, "")
                );

                let td = row.append("td");

                status === "active" ||
                    td
                        .append("button")
                        .text("Start")
                        .on("click", startConnector.bind(null, connector.id));
                status === "active" &&
                    td
                        .append("button")
                        .text("Stop")
                        .on("click", stopConnector.bind(null, connector.id));
                td.append("button")
                    .text("Delete")
                    .on("click", deleteConnector.bind(null, connector.id));
                //row.append('td').text(connector.id);
            }
        } else {
            body.append("P").text("You got none!");
        }

        // body.append("pre").text(JSON.stringify(connectors, null, 2));

        setTimeout(refresh, running ? 1000 : 5000);
    }

    refresh();
}

async function startConnector(name) {
    console.log(
        "DONE",
        name,
        await request("POST", `/api/v0/admin/connectors/${name}/start`)
    );
}

async function stopConnector(name) {
    console.log(
        "DONE",
        name,
        await request("POST", `/api/v0/admin/connectors/${name}/stop`)
    );
}

async function deleteConnector(name) {
    console.log(
        "DONE",
        name,
        await request("DELETE", `/api/v0/admin/connectors/${name}`)
    );
}
