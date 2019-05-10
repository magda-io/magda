import React from "react";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import Choice from "Components/Common/Choice";

import iconSearch from "assets/search-dark.svg";
import iconDocument from "assets/data-types/document.svg";
import iconSave from "assets/save.svg";

import iconUpload from "assets/upload-white.svg";
import iconWebsite from "assets/website-white.svg";
import iconDataEntry from "assets/data-entry-purple.svg";
import iconFolders from "assets/folders-purple.svg";

import "./DatasetAddPage.scss";

class AddDataset extends React.Component<any, any> {
    render() {
        return (
            <div className="container-fluid">
                <Medium>
                    <Breadcrumbs
                        breadcrumbs={[
                            <li key="datasets">
                                <span>Add data</span>
                            </li>
                        ]}
                    />
                </Medium>

                <div className="row">
                    <div className="col-sm-12">
                        <h1>Review and add metadata</h1>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-12">
                        <table>
                            <tbody>
                                <tr>
                                    <img
                                        src={iconSearch}
                                        className="instruction-icon"
                                    />
                                    <td>
                                        You can easily{" "}
                                        <strong>
                                            add a new record of a dataset to
                                            your internal catalogue
                                        </strong>{" "}
                                        to enable powerful search and discovery
                                        features.
                                    </td>
                                </tr>
                                <tr>
                                    <img
                                        src={iconDocument}
                                        className="instruction-icon"
                                    />
                                    <td>
                                        The MAGDA Publishing Tool can{" "}
                                        <strong>
                                            review your files and pre-populate
                                            metadata
                                        </strong>{" "}
                                        to ensure every dataset has a complete
                                        and high quality metadata record,
                                        without the need for arduous data entry.
                                    </td>
                                </tr>
                                <tr>
                                    <img
                                        src={iconSave}
                                        className="instruction-icon"
                                    />
                                    <td>
                                        You can{" "}
                                        <strong>
                                            save your metadata records as a
                                            draft
                                        </strong>{" "}
                                        until you are ready to submit them for
                                        approval.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-12">
                        <p>
                            Choose how you would like to add your dataset to
                            your catalogue:
                        </p>
                    </div>
                </div>

                <div className="row">
                    <Choice
                        heading="Have a single dataset made up of one or more files?"
                        icon={iconUpload}
                        blurb="Add your dataset file(s) to pre-populate metadata using the Magda Publishing Tool"
                        href="/dataset/add/files"
                    />
                    <Choice
                        heading="Dataset exists elsewhere online?"
                        icon={iconWebsite}
                        blurb="Enter the URL of an online dataset to pre-populate metadata using the Magda Publishing Tool."
                        href="/dataset/add/urls"
                    />
                    <Choice
                        heading="No files to upload?"
                        icon={iconDataEntry}
                        blurb="Manually add the dataset record and the metadata."
                        href="/dataset/add/metadata/-/0"
                        secondary
                    />
                    <Choice
                        heading="Adding multiple datasets?"
                        icon={iconFolders}
                        blurb="Add your entire dataset catalogue using our bulk CSV tool or open data catalogue"
                        href="/catalog/add"
                        secondary
                    />
                </div>
            </div>
        );
    }
}

export default AddDataset;
