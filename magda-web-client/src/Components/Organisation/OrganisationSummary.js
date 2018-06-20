import React from "react";
import { Link } from "react-router-dom";
import "./OrganisationSummary.css";

function OrganisationSummary(props) {
    const details = props.organisation.aspects["organization-details"];
    return (
        <div className="organisation-summray">
            <h2 className="organisation-title">
                <Link
                    to={
                        "organisations/" +
                        encodeURIComponent(props.organisation.id)
                    }
                >
                    {props.organisation.name}
                </Link>
            </h2>
            <div className="organisation-description">
                {details.description &&
                    details.description.slice(0, 200) + "..."}
            </div>
        </div>
    );
}

export default OrganisationSummary;
