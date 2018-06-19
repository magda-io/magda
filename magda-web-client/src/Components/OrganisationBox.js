import React from "react";
import { Link } from "react-router-dom";
import "./OrganisationBox.css";

export default function OrganisationBox(props) {
    const organisation = props.organisation;
    return (
        <div className="white-box organisation-box">
            <div className="inner">
                <h3>
                    <Link
                        to={`organisations/${encodeURIComponent(
                            organisation.id
                        )}`}
                    >
                        {organisation.name}
                    </Link>
                </h3>
                <div className="">{organisation["description"]}</div>
                <Link
                    to={`/search?organisation=${encodeURIComponent(
                        organisation.name
                    )}`}
                >
                    View all datasets
                </Link>
            </div>
        </div>
    );
}
