import React from "react";

import { Link } from "react-router-dom";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";

import iconSearch from "assets/search-dark.svg";
import iconDocument from "assets/data-types/document.svg";
import iconUpload from "assets/upload.svg";
import iconWebsite from "assets/website.svg";
import iconDataEntry from "assets/data-entry.svg";
import iconSave from "assets/save.svg";
import iconFolders from "assets/folders.svg";

import "./DatasetAddPage.scss";

class AddDataset extends React.Component<never, never> {
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
                    <div className="col-sm-12 options">
                        <div className="option-wrapper">
                            <Link to="/dataset/add/files">
                                <a className="option option-highlighted">
                                    <span className="option-question">
                                        Have a single dataset made up of one or
                                        more files?
                                    </span>
                                    <img
                                        src={iconUpload}
                                        className="option-icon"
                                    />
                                    <span className="option-label">
                                        Add your dataset file(s) to pre-populate
                                        metadata using the Magda Publishing Tool
                                    </span>
                                </a>
                            </Link>
                        </div>
                        <div className="option-wrapper">
                            <Link to="/dataset/add/urls">
                                <a className="option  option-highlighted">
                                    <span className="option-question">
                                        Dataset exists elsewhere online?
                                    </span>
                                    <img
                                        src={iconWebsite}
                                        className="option-icon"
                                    />
                                    <span className="option-label">
                                        Enter the URL of an online dataset to
                                        pre-populate metadata using the Magda
                                        Publishing Tool.
                                    </span>
                                </a>
                            </Link>
                        </div>
                        <div className="option-wrapper">
                            <Link to="/dataset/add/metadata/-/0">
                                <a className="option option-normal">
                                    <span className="option-question">
                                        No files to upload?
                                    </span>
                                    <img
                                        src={iconDataEntry}
                                        className="option-icon"
                                    />
                                    <span className="option-label">
                                        Manually add the dataset record and the
                                        metadata
                                    </span>
                                </a>
                            </Link>
                        </div>
                        <div className="option-wrapper">
                            <Link to="/dataset/add/bulk">
                                <a className="option option-normal">
                                    <span className="option-question">
                                        Adding multiple datasets?
                                    </span>
                                    <img
                                        src={iconFolders}
                                        className="option-icon"
                                    />
                                    <span className="option-label">
                                        Add your entire dataset catalogue using
                                        our bulk CSV tool or open data catalogue
                                    </span>
                                </a>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default AddDataset;
