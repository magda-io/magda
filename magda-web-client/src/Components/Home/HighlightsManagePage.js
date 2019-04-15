import React from "react";

import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";

import {
    listContent,
    deleteContent,
    writeContent
} from "actions/contentActions";
import { config } from "config";
import { ToggleEditor } from "Components/Editing/ToggleEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";

import readFile from "helpers/readFile";
import readImage from "helpers/readImage";

class Account extends React.Component {
    state = {
        deleteId: "",
        items: []
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    refresh() {
        listContent("home/highlights/*", "home/highlight-images/*").then(
            highlights => {
                let items = {};
                for (const item of highlights) {
                    if (item.id.indexOf("home/highlight-images/") === 0) {
                        const [, , id, width] = item.id.split("/");
                        items[id] = items[id] || { images: [] };
                        items[id].images.push(width);
                        items[id].images.sort();
                    } else if (item.id.indexOf("home/highlights/") === 0) {
                        const [, , id] = item.id.split("/");
                        items[id] = items[id] || { images: [] };
                        Object.assign(items[id], item.content);
                    }
                }
                items = Object.entries(items).map(params => {
                    let [id, body] = params;
                    return Object.assign(body, { id });
                });
                console.log(items);
                this.updateState({ items });
            }
        );
    }

    componentDidMount() {
        this.refresh();
    }

    render() {
        const { items } = this.state;

        items.sort((a, b) => (a.id > b.id ? 1 : -1));

        return (
            <MagdaDocumentTitle prefixes={["Home Feature Images"]}>
                <div>
                    <h1>Manage Highlights</h1>
                    {items.length === 0 ? (
                        <p>No highlights</p>
                    ) : (
                        <div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Highlight Image</th>
                                        <th>Text / Link</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(this.renderItem.bind(this))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <h2>Add New</h2>
                    <button onClick={this.addNewItem.bind(this)}>
                        Add New Highlight
                    </button>
                </div>
            </MagdaDocumentTitle>
        );
    }

    renderItem(item) {
        const save = field => {
            return async value => {
                const { text, url } = item;
                const toSave = {
                    text: text || undefined,
                    url: url || undefined
                };
                toSave[field] = value || undefined;
                Object.assign(item, toSave);
                await writeContent(
                    `home/highlights/${item.id}`,
                    toSave,
                    "application/json"
                );
            };
        };

        const { deleteId } = this.state;
        console.log(item, deleteId);
        return (
            <tr>
                <td>
                    <img
                        src={`${config.contentApiURL}home/highlight-images/${
                            item.id
                        }/${item.images[Math.min(1, item.images.length - 1)]}`}
                        alt="Highlight"
                        style={{
                            maxWidth: "367px",
                            maxHeight: "70px"
                        }}
                    />
                </td>
                <td>
                    <p>
                        Text:{" "}
                        <ToggleEditor
                            editor={textEditor}
                            value={item.text}
                            onChange={save("text")}
                        />
                        <br />
                        Link:{" "}
                        <ToggleEditor
                            editor={textEditor}
                            value={item.url}
                            onChange={save("url")}
                        />
                    </p>
                </td>
                <td>
                    {item.id === deleteId ? (
                        <div className="au-body au-page-alerts au-page-alerts--warning">
                            <div>Do you really want to delete this item?</div>
                            <div>
                                <button
                                    className="au-btn"
                                    onClick={() => this.deleteItem(item)}
                                >
                                    Yes
                                </button>{" "}
                                <button
                                    className="au-btn au-btn--secondary"
                                    onClick={() =>
                                        this.updateState({ deleteId: "" })
                                    }
                                >
                                    No
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() =>
                                this.updateState({
                                    deleteId: item.id
                                })
                            }
                        >
                            Delete
                        </button>
                    )}
                </td>
            </tr>
        );
    }

    async deleteItem(item) {
        let toDelete = await listContent(
            `home/highlights/${item.id}`,
            `home/highlight-images/${item.id}/*`
        );
        for (let item of toDelete) {
            await deleteContent(item.id);
        }
        this.refresh();
    }

    async addNewItem() {
        try {
            console.log("Reading file");
            const { data } = await readFile("image/*", "DataURL");
            const image = await readImage(data);
            if (image.width < 720) {
                throw new Error("Image width must be at least 720px");
            }
            if (image.height < 978) {
                throw new Error("Image height must be at least 978px");
            }

            console.log("Resizing image");

            const images = {};

            for (let w of [
                [0, 550, 978],
                [720, 720, 405],
                [1080, 1080, 677],
                [1440, 1440, 902],
                [2160, 2160, 1353]
            ]) {
                const [dim, width, height] = w;
                // status.text(` [ resizing image ${dim}w ]`);
                if (image.width >= width) {
                    images[`${dim}w`] = resizeImage(image, width, height);
                }
            }

            if (Object.keys(images) < 2) {
                throw new Error(
                    " [ Less than two images could be generated. Please try a different image. ]"
                );
            }

            console.log("Uploading images");

            const id = `home/highlights/${Date.now()}`;
            await writeContent(id, {}, "application/json");

            for (const width of Object.keys(images)) {
                const newId = `${id.replace(
                    "highlights",
                    "highlight-images"
                )}/${width}`;
                await writeContent(newId, images[width], "image/jpeg");
            }

            console.log("done");

            this.refresh();
        } catch (e) {
            console.error(e);
        }
    }
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
    let x = 0,
        y = 0,
        dx = width,
        dy = height;
    if (imageAspect < targetAspect) {
        dy = img.height * (dx / img.width);
        y = (height - dy) / 2;
    } else if (imageAspect > targetAspect) {
        dx = img.width * (height / img.height);
        y = (width - dx) / 2;
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

export default Account;
