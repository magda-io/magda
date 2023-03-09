import React, { Component } from "react";
import { config } from "config";
import readFile from "helpers/readFile";
import { writeContent } from "actions/contentActions";

class ContentImageEditor extends Component<any, any> {
    state = {
        imageItemId: "",
        imageAlt: "LOADING; CLICK TO SET;"
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    componentDidMount() {
        this.updateState({ imageItemId: this.props.imageItemId });
    }

    async changeImage() {
        if (this.props.hasEditPermissions) {
            console.log("Reading file");
            const { data, file } = await readFile(
                this.props.accept,
                "ArrayBuffer"
            );
            console.log("Saving file", this.props.imageItemId);
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
        const { imageItemId, imageAlt } = this.state;
        return (
            <React.Fragment>
                <img
                    src={config.contentApiBaseUrl + imageItemId}
                    alt={imageAlt}
                    style={{
                        maxHeight: "70px",
                        maxWidth: "367px",
                        cursor: "pointer"
                    }}
                    onError={(e) => {
                        this.updateState({
                            imageAlt: hasEditPermissions
                                ? "CLICK TO SET"
                                : "NODE"
                        });
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
