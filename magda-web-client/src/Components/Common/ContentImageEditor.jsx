import React, { Component } from "react";
import { config } from "config";

import { writeContent } from "actions/contentActions";

class ContentImageEditor extends Component {
    state = {
        imageItemId: ""
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    componentDidMount() {
        this.updateState({ imageItemId: this.props.imageItemId });
    }

    async changeImage() {
        if (this.props.hasEditPermissions) {
            const { data, file } = await readFile(
                this.props.accept,
                "ArrayBuffer"
            );
            await writeContent(
                this.props.imageItemId,
                new Blob([new Uint8Array(data)]),
                file.type
            );
            this.updateState({
                imageItemId: this.props.imageItemId + "?time=" + Date.now()
            });
        }
    }

    render() {
        const { hasEditPermissions } = this.props;
        const { imageItemId } = this.state;
        return (
            <React.Fragment>
                <img
                    src={config.contentApiURL + imageItemId}
                    alt="LOADING; CLICK TO SET;"
                    style={{
                        maxHeight: "70px",
                        maxWidth: "367px",
                        cursor: "pointer"
                    }}
                    onError={function(e) {
                        e.target.alt = hasEditPermissions
                            ? "CLICK TO SET"
                            : "NODE";
                    }}
                    onClick={this.changeImage.bind(this)}
                />
                {hasEditPermissions && (
                    <button
                        className="au-btn au-btn--tertiary"
                        onClick={this.changeImage.bind(this)}
                    >
                        Change Image
                    </button>
                )}
            </React.Fragment>
        );
    }
}

export default ContentImageEditor;

function readFile(accept, read = "ArrayBuffer") {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.click();
        input.onchange = function() {
            const file = input.files[0];
            const fileReader = new FileReader();
            fileReader.onloadend = function(e) {
                resolve({ data: e.target.result, file });
            };
            fileReader.onerror = function(e) {
                reject(e);
            };
            fileReader["readAs" + read](file);
        };
    });
}
