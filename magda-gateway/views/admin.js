const instanceURL = "/api/v0";
let timeout = null;

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

        const sections = {
            "My Information": showMe.bind(null, me),
            "Header Logo": showHeaderLogo,
            "Header Navigation": showHeaderNavigation,
            "Header Taglines": showHeaderTaglines,
            "Homepage Highlights": showHomeHighlights,
            "Homepage Stories": showHomeStories,
            "Content Pages": showContent,
            "CSV Data": showSpreadsheets,
            Connectors: showConnectors,
            Language: showLanguage,
            "Footer Navigation": showFooterNavigation,
            "Footer Copyright": showFooterCopyright,
            "Manage Users": showUsers
        };

        const section = body.append("select");
        const sectionBody = body.append("div");
        for (let key of Object.keys(sections)) {
            section.append("option").text(key);
        }
        section.on("change", () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            sections[section.property("value")](sectionBody.text("Loading..."));
        });
        section.on("change")();
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

function showMe(me, body) {
    body.text("");
    body.append("h2").text("My Information");
    body.append("pre").text(JSON.stringify(me, null, 2));
}

function showHeaderLogo(body) {
    body.append("h2").text("Header Logo");

    const table = body.append("table");

    let row = table.append("tr");
    row.append("th").text("item");
    row.append("th")
        .style("width", "100%")
        .text("value");

    row = table.append("tr");
    row.append("td").text("Full Logo");
    imageConfig(row.append("td").style("width", "100%"), "header/logo");

    row = table.append("tr");
    row.append("td").text("Mobile Logo");
    imageConfig(row.append("td"), "header/logo-mobile");
}

function showHeaderNavigation(body) {
    showJsonEditor(body, {
        label: "Header Navigation",
        idPattern: "header/navigation/*",
        schema: headerNavigationSchema,
        allowDelete: true,
        allowAdd: true,
        newId: () => `header/navigation/${Date.now()}`
    });
}

function showHeaderTaglines(body) {
    showJsonEditor(body, {
        label: "Header Taglines",
        idPattern: "home/tagline/*",
        schema: headerTaglineSchema,
        allowDelete: false,
        allowAdd: false
    });
}

function showHomeStories(body) {
    showJsonEditor(body, {
        label: "Home Stories",
        idPattern: "home/stories/*",
        schema: homeStorySchema,
        allowDelete: true,
        allowAdd: true,
        newId: () => `home/stories/${Date.now()}`,
        extraControls: (parent, file) => {
            parent.append("h4").text("Story Image");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/stories/, "home/story-images")
            );
        }
    });
}

function showContent(body) {
    showJsonEditor(body, {
        label: "Content Pages",
        idPattern: "page/*",
        schema: pageSchema,
        allowDelete: true,
        allowAdd: true,
        allowIdFieldInput: true,
        newId: id => `page/${id}`
    });
}

function showHomeHighlights(body) {
    showJsonEditor(body, {
        label: "Home Highlights",
        idPattern: "home/highlights/*",
        schema: homeHighlightSchema,
        allowDelete: true,
        allowAdd: true,
        newId: () => `home/highlights/${Date.now()}`,
        extraControls: (parent, file) => {
            parent.append("h4").text("Highlight Images width > 0");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/highlights/, "home/highlight-images") +
                    "/0w"
            );
            parent.append("h4").text("Highlight Images width > 720");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/highlights/, "home/highlight-images") +
                    "/720w"
            );
            parent.append("h4").text("Highlight Images width > 1080");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/highlights/, "home/highlight-images") +
                    "/1080w"
            );
            parent.append("h4").text("Highlight Images width > 1440");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/highlights/, "home/highlight-images") +
                    "/1440w"
            );
            parent.append("h4").text("Highlight Images width > 2160");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/highlights/, "home/highlight-images") +
                    "/2160w"
            );
            parent.append("h4").text("Highlight Images width > 2880");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/highlights/, "home/highlight-images") +
                    "/2880w"
            );
        }
    });
}

function showLanguage(body) {
    showJsonEditor(body, {
        label: "Language Items",
        idPattern: "lang/en/*",
        schema: languageSchema,
        allowDelete: true,
        allowAdd: true,
        allowIdFieldInput: true,
        newId: id => `lang/en/${id}`,
        mimeType: "text/plain"
    });
}

function showFooterNavigation(body) {
    body.text("");
    showJsonEditor(body.append("div"), {
        label: "Medium Footer Navigation Categories",
        idPattern: "footer/navigation/medium/category/*",
        schema: footerCategory,
        allowDelete: true,
        allowAdd: true,
        newId: id => `footer/navigation/medium/category/${Date.now()}`,
        extraControls: (parent, file) => {
            const prefix = file.id.substr(
                "footer/navigation/medium/category/".length
            );
            showJsonEditor(parent.append("div").style("padding-left", "5em"), {
                label: "Category Menu Items",
                idPattern: `footer/navigation/medium/category-links/${prefix}/*`,
                schema: footerLink,
                allowDelete: true,
                allowAdd: true,
                newId: id =>
                    `footer/navigation/medium/category-links/${prefix}/${Date.now()}`
            });
        }
    });
    showJsonEditor(body.append("div"), {
        label: "Small Footer Navigation Categories",
        idPattern: "footer/navigation/small/category/*",
        schema: footerCategory,
        allowDelete: true,
        allowAdd: true,
        newId: id => `footer/navigation/small/category/${Date.now()}`,
        extraControls: (parent, file) => {
            const prefix = file.id.substr(
                "footer/navigation/small/category/".length
            );
            showJsonEditor(parent.append("div").style("padding-left", "5em"), {
                label: "Category Menu Items",
                idPattern: `footer/navigation/small/category-links/${prefix}/*`,
                schema: footerLink,
                allowDelete: true,
                allowAdd: true,
                newId: id =>
                    `footer/navigation/small/category-links/${prefix}/${Date.now()}`
            });
        }
    });
}

function showFooterCopyright(body) {
    showJsonEditor(body, {
        label: "Footer Copyright",
        idPattern: "footer/copyright/*",
        schema: footerCopyright,
        allowDelete: true,
        allowAdd: true,
        newId: id => `footer/copyright/${Date.now()}`
    });
}

async function showJsonEditor(body, options) {
    let files = await request(
        "GET",
        `/api/v0/content/all?id=${options.idPattern}&inline=true`
    );
    if (files.length && files[0].order !== undefined) {
        files = files.sort(
            (a, b) =>
                a.content.order === b.content.order
                    ? a.id < b.id
                        ? -1
                        : 1
                    : a.content.order - b.content.order
        );
    }

    body.text("");

    body.append("h2").text(options.label);

    if (files.length > 0) {
        files.forEach((file, index, files) => {
            const container = jsoneditor(
                body.append("div").style("border", "10px solid black"),
                {
                    title: file.id,
                    schema: options.schema,
                    startval: file.content,
                    label: "Save",
                    callback: async newObj => {
                        console.log(
                            "DONE",
                            name,
                            await request(
                                "PUT",
                                `/api/v0/content/${file.id}`,
                                newObj,
                                options.mimeType || "application/json"
                            )
                        );
                        showJsonEditor(body, options);
                    }
                }
            );
            if (options.allowDelete) {
                container
                    .append("button")
                    .text("Delete")
                    .on("click", async () => {
                        console.log(
                            "DONE",
                            name,
                            await request(
                                "DELETE",
                                `/api/v0/content/${file.id}`
                            )
                        );
                        showJsonEditor(body, options);
                    });
            }
            if (options.extraControls) {
                options.extraControls(container, file, index, files);
            }
        });
    } else {
        body.append("P").text("You got none!");
    }

    if (options.allowAdd) {
        let idField;
        if (options.allowIdFieldInput) {
            const container = body.append("p");
            container.append("strong").text("ID: ");
            idField = container.append("input");
        }
        jsoneditor(body.append("div"), {
            title: "Add new",
            schema: options.schema,
            startval: null,
            label: "Add",
            callback: async newObj => {
                console.log(
                    "DONE",
                    name,
                    await request(
                        "PUT",
                        `/api/v0/content/${options.newId(
                            idField ? idField.property("value") : undefined
                        )}`,
                        newObj,
                        "application/json"
                    )
                );
                showJsonEditor(body, options);
            }
        });
    }
}

function jsoneditor(parent, options) {
    var element = parent.node();
    var editor = new JSONEditor(element, {
        schema: Object.assign({}, options.schema, {
            title: options.title,
            options: {
                remove_empty_properties: true
            }
        }),
        startval: options.startval,
        disable_edit_json: true,
        disable_collapse: true,
        disable_properties: false,
        show_errors: "always",
        form_name_root: options.title,
        keep_oneof_values: false,
        no_additional_properties: true
    });
    var button = parent.append("button").text(options.label);
    button.on("click", async () => {
        const value = await validate();
        if (value) {
            options.callback(value);
        }
    });
    async function validate() {
        var errors = editor.validate();
        if (errors.length === 0) {
            button.style("display", "");
            return editor.getValue();
        } else {
            button.style("display", "none");
            return false;
        }
    }
    editor.on("ready", validate);
    editor.on("change", validate);
    validate();
    return parent;
}

function imageConfig(body, name) {
    body.text("");

    body.append("img")
        .attr("src", `${instanceURL}/content/${name}.bin`)
        .attr("onerror", `this.alt='NONE'`)
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
                        "PUT",
                        `${instanceURL}/content/${name}`,
                        data,
                        file.type
                    );
                    imageConfig(body, name);
                };
                fileReader.readAsArrayBuffer(file);
            };
        });

    return body;
}

function request(method, url, body = null, contentType = undefined) {
    console.log(method, url, body);
    const headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0"
    };
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
                        "PUT",
                        `${instanceURL}/content/${name}`,
                        data,
                        file.type
                    );

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

    showConnectors(body.append("div"));
}

async function deleteContent(name) {
    console.log(
        "DONE",
        name,
        await request("DELETE", `/api/v0/content/${name}`)
    );
}

async function createConnector(name) {
    const sourceUrl = `http://content-api/v0/${name}.bin`;

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
}

function showConnectors(body) {
    body.text("");
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

        timeout = setTimeout(refresh, running ? 1000 : 5000);
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

async function showUsers(body) {
    const users = await request("GET", "/api/v0/auth/users/all");
    body.text("");
    body.append("h2").text("Manage Users");

    const table = body.append("table");
    const head = table.append("thead").append("tr");
    head.append("th").text("name");
    head.append("th").text("email");
    head.append("th").text("source");
    head.append("th").text("admin");
    users.items.forEach(user => {
        const row = table.append("tr");
        row.append("td").text(user.displayName);
        row.append("td").text(user.email);
        row.append("td").text(user.source);
        const admin = row.append("td");
        if (user.isAdmin) {
            admin
                .append("button")
                .text("Unmake Admin")
                .on("click", async () => {
                    await request(
                        "PUT",
                        `/api/v0/auth/users/${user.id}`,
                        {
                            isAdmin: false
                        },
                        "application/json"
                    );
                    showUsers(body);
                });
        } else {
            admin
                .append("button")
                .text("Make Admin")
                .on("click", async () => {
                    await request(
                        "PUT",
                        `/api/v0/auth/users/${user.id}`,
                        {
                            isAdmin: true
                        },
                        "application/json"
                    );
                    showUsers(body);
                });
        }
    });
}

const headerNavigationSchema = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1,
            propertyOrder: 99
        }
    },
    oneOf: [
        {
            title: "Regular Menu",
            properties: {
                default: {
                    title: "Configuration",
                    type: "object",
                    properties: {
                        label: {
                            type: "string",
                            minLength: 1,
                            propertyOrder: 1
                        },
                        rel: {
                            type: "string",
                            minLength: 2,
                            propertyOrder: 3
                        },
                        target: {
                            type: "string",
                            enum: ["", "blank"],
                            propertyOrder: 4,
                            default: ""
                        },
                        href: {
                            type: "string",
                            minLength: 1,
                            propertyOrder: 2
                        }
                    },
                    required: ["label", "href"],
                    options: {
                        remove_empty_properties: true
                    }
                }
            },
            required: ["default"]
        },
        {
            title: "Authentication Menu",
            properties: {
                auth: {
                    title: "Authentication Menu",
                    type: "object",
                    options: {
                        hidden: true
                    }
                }
            },
            required: ["auth"]
        }
    ],
    required: ["order"]
};

const headerTaglineSchema = {
    type: "string"
};

const languageSchema = {
    type: "string"
};

const homeStorySchema = {
    type: "object",
    properties: {
        title: {
            type: "string",
            minLength: 1
        },
        titleUrl: {
            type: "string",
            minLength: 1
        },
        order: {
            type: "number"
        },
        content: {
            type: "string",
            minLength: 1,
            format: "markdown"
        }
    },
    required: ["title", "order", "content"]
};

const homeHighlightSchema = {
    type: "object",
    properties: {
        text: {
            type: "string",
            minLength: 1
        },
        url: {
            type: "string",
            minLength: 1
        }
    },
    required: ["text", "url"]
};

const footerCategory = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        },
        label: {
            type: "string",
            minLength: 1
        }
    },
    required: ["order", "label"]
};

const footerLink = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        },
        label: {
            type: "string",
            minLength: 1
        },
        href: {
            type: "string",
            minLength: 1
        }
    },
    required: ["order", "label", "href"]
};

const footerCopyright = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        },
        href: {
            type: "string",
            minLength: 1
        },
        logoSrc: {
            type: "string",
            minLength: 1
        },
        logoClassName: {
            type: "string",
            default: ""
        },
        logoAlt: {
            type: "string",
            default: ""
        },
        htmlContent: {
            type: "string",
            minLength: 1
        }
    },
    required: ["order", "href", "logoSrc", "htmlContent"]
};

const pageSchema = {
    type: "object",
    properties: {
        title: {
            type: "string",
            minLength: 1
        },
        content: {
            type: "string",
            minLength: 1,
            format: "markdown"
        }
    },
    required: ["title"]
};
