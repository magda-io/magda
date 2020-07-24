import React from "react";
import "./SecClassification.scss";
import { classification } from "../../constants/DatasetConstants";

interface PropsTypeClassification {
    secClass: string;
}

interface PropsTypeSensitivity {
    sensitivityList: Array<string>;
}

function SecClassification(props: PropsTypeClassification) {
    const classificationVal = props.secClass;
    if (!classificationVal) {
        return null;
    }
    if (!classification[classificationVal]) {
        // Invalid classification
        return null;
    }
    return (
        <div className="classification-box">
            <div className="dataset-heading">
                Security Classification: {classificationVal}
            </div>
        </div>
    );
}

SecClassification.defaultProps = {
    secClass: "UNOFFICIAL"
};

export function Sensitivity(props: PropsTypeSensitivity) {
    const disseminationList: Array<string> = props.sensitivityList.map((s) => {
        return s.toLowerCase();
    });
    return (
        <div className="classification-box">
            <div className="dataset-heading">
                Sensitivity: {disseminationList.join(", ")}
            </div>
        </div>
    );
}

export default SecClassification;
