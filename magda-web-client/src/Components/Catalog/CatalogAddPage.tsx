import React from "react";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";

import WebsiteIcon from "Components/Catalog/website.svg";
import CSVIcon from "Components/Catalog/csv.svg";

import Styles from "Components/Catalog/CatalogAddPage.module.scss";

type Props = {};

type State = {};

type ChoiceProps = {
    heading: string;
    blurb: string;
    href: string;
    icon: string;
};

function Choice(props: ChoiceProps) {
    return (
        <div className="col-sm-12 col-md-6">
            <a href={props.href} className="au-btn">
                <h2 className={Styles.buttonHeading}>{props.heading}</h2>{" "}
                <div className={Styles.choiceIconRow}>
                    <img className={Styles.choiceIcon} src={props.icon} />
                    {props.blurb}
                </div>
            </a>
        </div>
    );
}

class AddCatalog extends React.Component<Props, State> {
    state: State = {};

    render() {
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
                        We've created a few methods for you to add your entire
                        data catalogue to Magda quickly and easily:
                    </div>
                </div>

                <div className={`row ${Styles.buttonRow}`}>
                    <Choice
                        heading="Static catalogue?"
                        blurb="Create and upload a CSV of all your datasets"
                        href="/catalog/add/csv"
                        icon={CSVIcon}
                    />
                    <Choice
                        heading="Online catalogue?"
                        blurb="Connect to an existing open data portal"
                        href="/catalog/add/"
                        icon={WebsiteIcon}
                    />
                </div>
            </div>
        );
    }
}

export default AddCatalog;
