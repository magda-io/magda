// @flow
import React from "react";
import "./MatchingStatus.css";
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
                    The following datasets match some but not all of your search
                    criteria
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
                                your search
                            </strong>
                        </p>
                        <p>
                            Please try a different search term, check your
                            spelling or
                            {config.enableSuggestDatasetPage ? (
                                <Link to="suggest">suggest a dataset</Link>
                            ) : (
                                <a href="mailto:data@digital.gov.au">
                                    {" "}
                                    request a new dataset
                                </a>
                            )}
                        </p>
                    </AUpageAlert>
                </div>
            </div>
        );
    }
}
