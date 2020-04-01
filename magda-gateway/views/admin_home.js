addSection("Home Taglines", async function(body) {
    showJsonEditor(body, {
        label: "Home Taglines",
        idPattern: "home/tagline/*",
        schema: headerTaglineSchema,
        allowDelete: false,
        allowAdd: false
    });
});

addSection("Home Features", async function(body) {
    const options = {
        idPattern: "home/highlights/*",
        schema: homeHighlightSchema
    };

    async function refresh() {
        body.text("Loading...");
        let files = await request(
            "GET",
            `/api/v0/content/all?id=home/highlights/*&inline=true`
        );

        (
            await request(
                "GET",
                `/api/v0/content/all?id=home/highlight-images/*&inline=true`
            )
        ).forEach(img => {
            let id = img.id.replace("highlight-images", "highlights");
            id = id.substr(0, id.lastIndexOf("/"));
            if (files.filter(f => f.id === id).length === 0) {
                files.push({
                    id,
                    content: {}
                });
            }
        });

        body.text("");

        const table = body.append("table");
        const thead = table.append("thead").append("tr");
        thead.append("th").text("No");
        thead.append("th").text("Feature Image");
        thead.append("th").text("Feature Text / Link");
        thead.append("th").text("Delete");
        const tobody = table.append("tbody");

        files.forEach((file, index, files) => {
            const parent = tobody.append("tr");
            parent.append("th").text(index + 1);
            let td = parent.append("td");
            td.append("img")
                .attr(
                    "src",
                    `${instanceURL}/content/${file.id.replace(
                        /^home\/highlights/,
                        "home/highlight-images"
                    )}/720w`
                )
                .attr("onerror", `this.alt='NONE'`)
                .style("max-height", `70px`)
                .style("max-width", `367px`);

            uploadFeatureImage(td, "Change", () => file.id, refresh);

            td = parent.append("td");
            jsoneditor(td, {
                title: "Edit",
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
                    refresh();
                }
            });

            parent
                .append("td")
                .append("button")
                .text("Delete")
                .on("click", async () => {
                    const id = file.id;
                    const imagesId = id.replace(
                        /^home\/highlights/,
                        "home/highlight-images"
                    );
                    let toDelete = await request(
                        "GET",
                        `${instanceURL}/content/all?id=${imagesId}/*&id=${id}`
                    );
                    for (let item of toDelete) {
                        await request(
                            "DELETE",
                            `${instanceURL}/content/${item.id}`
                        );
                    }
                    refresh();
                });
        });

        uploadFeatureImage(
            body,
            "Add New Feature Image",
            () => `home/highlights/${Date.now()}`,
            refresh
        );
    }

    refresh();
});
const headerTaglineSchema = {
    type: "string"
};

const homeHighlightSchema = {
    type: "object",
    properties: {
        text: {
            type: "string"
        },
        url: {
            type: "string"
        }
    }
};

function uploadFeatureImage(body, text, idCallback, doneCallback) {
    body = body
        .append("button")
        .text(text)
        .on("click", () => {
            status.text(" [ reading file ] ").style("color", "grey");
            readFile(
                async (data, file) => {
                    status.text("loading image");
                    readImage(data, async image => {
                        if (image.width < 720) {
                            return status.text(
                                " [ Image width must be at least 720px ]"
                            );
                        }
                        if (image.height < 978) {
                            return status.text(
                                " [ Image height must be at least 978px ]"
                            );
                        }
                        const images = {};

                        for (let w of [
                            [0, 550, 978],
                            [720, 720, 405],
                            [1080, 1080, 677],
                            [1440, 1440, 902],
                            [2160, 2160, 1353]
                        ]) {
                            const [dim, width, height] = w;
                            status.text(` [ resizing image ${dim}w ]`);
                            if (image.width >= width) {
                                images[`${dim}w`] = resizeImage(
                                    image,
                                    width,
                                    height
                                );
                            }
                        }

                        if (Object.keys(images) < 2) {
                            return status.text(
                                " [ Less than two images could be generated. Please try a different image. ]"
                            );
                        }

                        status.text(` [ uploading images ]`);

                        const id = idCallback();

                        const imagesId = id.replace(
                            /^home\/highlights/,
                            "home/highlight-images"
                        );

                        let toDelete = await request(
                            "GET",
                            `/api/v0/content/all?id=${imagesId}/*`
                        );

                        for (const width of Object.keys(images)) {
                            const newId = `${imagesId}/${width}`;
                            await request(
                                "PUT",
                                `${instanceURL}/content/${newId}`,
                                images[width],
                                "image/jpeg"
                            );
                            status.text(` [ uploading ${newId} ] `);
                            toDelete = toDelete.filter(i => i.id !== newId);
                        }

                        for (let item of toDelete) {
                            status.text(`deleting ${item.id}`);
                            await request(
                                "DELETE",
                                `/api/v0/content/${item.id}`
                            );
                        }

                        try {
                            const meta = await await request(
                                "GET",
                                `/api/v0/content/${id}.json`
                            );
                        } catch (e) {
                            status.text(" [ put in new meta] ");
                            await request(
                                "PUT",
                                `${instanceURL}/content/${id}`,
                                {},
                                "application/json"
                            );
                        }

                        status.text(` [ done ] `);

                        doneCallback();
                    });
                },
                '"image/*"',
                "DataURL"
            );
        });
    const status = body.append("span").style("color", "grey");
    const error = body.append("span").style("color", "red");
}

function resizeImage(img, width, height) {
    const canvas = document.createElement("canvas");
    canvas.style.border = "1px solid black";
    // document.body.appendChild(canvas);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageAspect = img.width / img.height;
    const targetAspect = width / height;
    let x = 0;
    y = 0;
    dx = width;
    dy = height;
    if (imageAspect < targetAspect) {
        dy = img.height * (dx / img.width);
        yStart = (height - dy) / 2;
    } else if (imageAspect > targetAspect) {
        dx = img.width * (height / img.height);
        x0 = (width - dx) / 2;
    }
    ctx.drawImage(img, x, y, dx, dy); // destination rectangle
    return dataURItoBlob(canvas.toDataURL("image/jpeg", 90));
}

// https://stackoverflow.com/questions/12168909/blob-from-dataurl
function dataURItoBlob(dataURI) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    var byteString = atob(dataURI.split(",")[1]);

    // separate out the mime component
    var mimeString = dataURI
        .split(",")[0]
        .split(":")[1]
        .split(";")[0];

    // write the bytes of the string to an ArrayBuffer
    var ab = new ArrayBuffer(byteString.length);

    // create a view into the buffer
    var ia = new Uint8Array(ab);

    // set the bytes of the buffer to the correct values
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    var blob = new Blob([ab], {
        type: mimeString
    });
    return blob;
}
