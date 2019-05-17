import React from "react";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import Choice from "Components/Common/Choice";

import CSVIcon from "assets/csv-white.svg";
import WebsiteIcon from "assets/website-white.svg";
import UploadIcon from "assets/upload-purple.svg";

export default function AddCatalog() {
    return (
        <div>
            <Medium>
                <Breadcrumbs
                    breadcrumbs={[
                        <li key="add-data">
                            <span>Add Data</span>
                        </li>
                    ]}
                />
            </Medium>

            <div className="row">
                <div className="col-sm-12">
                    <h1>Add your entire data catalog</h1>
                </div>
            </div>

            <div className="row">
                <div className="col-sm-12">
                    We've created a few methods for you to add your entire data
                    catalogue to Magda quickly and easily:
                </div>
            </div>

            <div className={`row`}>
                <Choice
                    heading="Static catalogue?"
                    blurb="Create and upload a CSV of all your datasets"
                    href="/catalog/add/csv"
                    icon={CSVIcon}
                />
                <Choice
                    heading="Online catalogue?"
                    blurb="Connect to an existing open data portal"
                    href="/catalog/add/connector"
                    icon={WebsiteIcon}
                />
                <Choice
                    secondary
                    heading="Have a single dataset made up of multiple files?"
                    blurb="Add your dataset files to pre-populate metadata using the Magda Publishing Tools"
                    href="/dataset/add"
                    icon={UploadIcon}
                />
            </div>
        </div>
    );
}
