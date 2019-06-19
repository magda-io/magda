import React from "react";
import Choice from "Components/Common/Choice";

import iconSearch from "assets/icon-search.svg";
import iconDocument from "assets/icon-document.svg";
import iconSave from "assets/icon-save.svg";

import iconUpload from "assets/upload-white.svg";
import iconWebsite from "assets/website-white.svg";
import iconDataEntry from "assets/data-entry-purple.svg";
import iconFolders from "assets/noun-files.png";

import "./DatasetAddPage.scss";

class AddDataset extends React.Component<any, any> {
    render() {
        return (
            <div className="container-fluid add-dataset-page-container borderLR">
                <div className="row heading-row borderLR ">
                    <div className="col-sm-12">
                        <div className="heading container">Add a Dataset</div>
                    </div>
                </div>
                <div className="row lower-header borderLR">
                    <div className="col-sm-12">
                        <div className="container">
                            <div className="row lower-header-icons">
                                <div className="col-sm-4 block">
                                    <img
                                        src={iconSearch}
                                        className="icon-search"
                                    />
                                </div>
                                <div className="col-sm-4 block">
                                    <img
                                        src={iconDocument}
                                        className="icon-document"
                                    />
                                </div>
                                <div className="col-sm-4 block">
                                    <img src={iconSave} className="icon-oval" />
                                </div>
                            </div>
                            <div className="row">
                                <div className="col-sm-4 text-block-container">
                                    <div className="text-block text-block-1">
                                        You can easily{" "}
                                        <strong>
                                            add a new record of a dataset to
                                            your internal catalogue
                                        </strong>{" "}
                                        to enable powerful search and discovery
                                        features.
                                    </div>
                                </div>
                                <div className="col-sm-4 text-block-container">
                                    <div className="text-block text-block-2">
                                        The MAGDA Publishing Tool can{" "}
                                        <strong>
                                            review your files and pre-populate
                                            metadata
                                        </strong>{" "}
                                        to ensure every dataset has a complete
                                        and high quality metadata record,
                                        without the need for arduous data entry.
                                    </div>
                                </div>
                                <div className="col-sm-4 text-block-container">
                                    <div className="text-block text-block-3">
                                        You can{" "}
                                        <strong>
                                            save your metadata records as a
                                            draft
                                        </strong>{" "}
                                        until you are ready to submit them for
                                        approval.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row body-heading-row borderLR">
                    <div className="col-sm-12">
                        <div className="container">
                            <p>
                                Choose how you would like to add your dataset to
                                your catalogue:
                            </p>
                        </div>
                    </div>
                </div>

                <div className="row main-body-row borderLR">
                    <div className="container">
                        <Choice
                            className={"choice-1"}
                            heading="Have a single dataset made up of one or more files?"
                            icon={iconUpload}
                            blurb="Add your dataset file(s) to pre-populate metadata using the Magda Publishing Tool"
                            href="/dataset/add/files"
                        />
                        <Choice
                            className={"choice-2"}
                            heading="Dataset exists elsewhere online?"
                            icon={iconWebsite}
                            blurb="Enter the URL of an online dataset to pre-populate metadata using the Magda Publishing Tool."
                            href="/dataset/add/urls"
                        />
                        <Choice
                            className={"choice-3"}
                            heading="No files to upload?"
                            icon={iconDataEntry}
                            blurb="Manually add the dataset record and the metadata."
                            href="/dataset/add/metadata/-/0"
                            secondary
                        />
                        <Choice
                            className={"choice-4"}
                            heading="Adding multiple datasets?"
                            icon={iconFolders}
                            blurb="Add your entire dataset catalogue using our bulk CSV tool or open data catalogue"
                            href="/catalog/add"
                            secondary
                        />
                    </div>
                </div>
            </div>
        );
    }
}

export default AddDataset;
