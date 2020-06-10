function imageConfig(body, name) {
    body.text("");

    body.append("img")
        .attr("src", `${instanceURL}/content/${name}`)
        .attr("onerror", `this.alt='NONE'`)
        .style("max-height", `70px`)
        .style("max-width", `367px`);

    body.append("button")
        .text("Change")
        .on("click", () => {
            readFile(
                async (data, file) => {
                    data = new Blob([new Uint8Array(data)]);
                    await request(
                        "PUT",
                        `${instanceURL}/content/${name}`,
                        data,
                        file.type
                    );
                    imageConfig(body, name);
                },
                '"image/*"',
                "ArrayBuffer"
            );
        });

    return body;
}

function iconConfig(body, name) {
    body.text("");

    body.append("img")
        .attr("src", `${instanceURL}/content/${name}`)
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
            input.onchange = function () {
                const file = input.files[0];
                const fileReader = new FileReader();
                fileReader.onloadend = async function (e) {
                    const data = new Blob([new Uint8Array(e.target.result)]);
                    await request(
                        "PUT",
                        `${instanceURL}/content/${name}`,
                        data,
                        "image/x-icon"
                    );
                    imageConfig(body, name);
                };
                fileReader.readAsArrayBuffer(file);
            };
        });

    return body;
}

function readFile(callback, accept, read) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.click();
    input.onchange = function () {
        const file = input.files[0];
        const fileReader = new FileReader();
        fileReader.onloadend = function (e) {
            callback(e.target.result, file);
        };
        fileReader.error = function (e) {
            console.error(e);
        };
        fileReader["readAs" + read](file);
    };
}

function readImage(src, callback) {
    var img = new Image();
    img.onload = function () {
        callback(this);
    };
    img.src = src;
}

async function showJsonEditor(body, options) {
    let files = await request(
        "GET",
        `/api/v0/content/all?id=${options.idPattern}&inline=true`
    );
    if (files.length && files[0].order !== undefined) {
        files = files.sort((a, b) =>
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
                    callback: async (newObj) => {
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
            callback: async (newObj) => {
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
