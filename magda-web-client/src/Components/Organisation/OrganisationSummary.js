import React from "react";
import { Link } from "react-router-dom";
import "./OrganisationSummary.scss";

function OrganisationSummary(props) {
    return (
        <div className="publisher-summray">
            <h2 className="publisher-title">
                <Link
                    to={
                        "organisations/" +
                        encodeURIComponent(props.publisher.identifier)
                    }
                >
                    {props?.publisher?.name}
                </Link>
            </h2>
            <div className="publisher-meta">
                {props.publisher.jurisdiction ? (
                    <span className="publisher-meta-jurisdiction">
                        {props.publisher.jurisdiction} &nbsp; | &nbsp;
                    </span>
                ) : null}
                <Link
                    to={{
                        pathname: "/search",
                        search: `organisation=${encodeURIComponent(
                            props?.publisher?.name
                        )}`,
                        state: {
                            showFilterExplanation: true
                        }
                    }}
                >
                    {props.publisher.datasetCount
                        ? `${props.publisher.datasetCount} ${
                              props.publisher.datasetCount > 1
                                  ? "datasets"
                                  : "dataset"
                          }`
                        : ""}
                </Link>
            </div>
            <div className="publisher-description">
                {props.publisher.description ? props.publisher.description : ""}
            </div>
        </div>
    );
}

export default OrganisationSummary;
