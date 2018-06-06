// @flow
import React from "react";
import "./MatchingStatus.css";
import Stories from "../../Pages/HomePageComponents/Stories";
import { Link } from "react-router-dom";
import AUpageAlert from "../../pancake/react/page-alerts";
import { config } from "../../config";
export default function MatchingStatus(props: {
    datasets: Array<Object>,
    strategy: string
}) {
    if (props.datasets.length > 0) {
        if (props.strategy === "match-part") {
            return (
                <div className="no-matching">
                    Sorry, no dataset matches all of your search criteria.
                </div>
            );
        } else {
            return null;
        }
    } else {
        return (
            <div>
                <div className="no-matching">
                    <AUpageAlert as="error">
                        <p>
                            <strong>
                                Sorry, we couldn't find any datasets that match
                                your search query.
                            </strong>
                        </p>
                        <p>
                            Try another search,{"  "}
                            {config.enableSuggestDatasetPage ? (
                                <Link to="suggest">suggest a new dataset</Link>
                            ) : (
                                <a href="mailto:data@digital.gov.au">
                                    {" "}
                                    request a new dataset
                                </a>
                            )}, or have a look at these great datasets
                        </p>
                    </AUpageAlert>
                </div>
                <Stories />
            </div>
        );
    }
}
