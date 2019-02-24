import React from "react";
import "./MatchingStatus.css";
import { Link } from "react-router-dom";
import AUpageAlert from "../../pancake/react/page-alerts";
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
                    <AUpageAlert as="error">blah</AUpageAlert>
                </div>
            </div>
        );
    }
}
