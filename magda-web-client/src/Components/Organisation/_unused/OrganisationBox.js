import React from "react";
import { Link } from "react-router-dom";
import "./OrganisationBox.scss";

export default function OrganisationBox(props) {
    const publisher = props.publisher;
    return (
        <div className="white-box publisher-box">
            <div className="inner">
                <h3>
                    <Link
                        to={`organisations/${encodeURIComponent(publisher.id)}`}
                    >
                        {publisher?.name}
                    </Link>
                </h3>
                <div className="">{publisher["description"]}</div>
                <Link
                    to={`/search?organisation=${encodeURIComponent(
                        publisher?.name
                    )}`}
                >
                    View all datasets
                </Link>
            </div>
        </div>
    );
}
