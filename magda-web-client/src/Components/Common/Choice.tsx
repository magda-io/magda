import React from "react";
import "Components/Common/Choice.scss";

type ChoiceProps = {
    heading: string;
    blurb: string;
    href: string;
    icon: string;
    secondary?: boolean;
};

export default function Choice(props: ChoiceProps) {
    return (
        <div className={`col-sm-12 col-md-6 choice-Col`}>
            <a
                href={props.href}
                className={`au-btn ${
                    props.secondary ? "au-btn--secondary" : ""
                } choice-Button`}
            >
                <h2 className="choice-buttonHeading">{props.heading}</h2>{" "}
                <div className="choice-IconRow">
                    <img className="choice-Icon" src={props.icon} />
                    {props.blurb}
                </div>
            </a>
        </div>
    );
}
