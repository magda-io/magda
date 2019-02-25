import React from "react";
import { Link } from "react-router-dom";
const AUpageAlert = require("../../pancake/react/page-alerts").default;

import "./MatchingStatus.scss";

export default function MatchingStatus(props: {
    datasets: Array<any>;
    strategy: string;
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
                    <AUpageAlert>
                        <p>
                            <strong>
                                Sorry, we couldn't find any datasets that match
                                your search
                            </strong>
                        </p>
                        <p>
                            Please try a different search term, check your
                            spelling or{" "}
                            <Link to="suggest">suggest a dataset</Link>.
                        </p>
                    </AUpageAlert>
                </div>
            </div>
        );
    }
}
