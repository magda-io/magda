import React from "react";
import Styles from "Components/Common/Choice.module.scss";

type ChoiceProps = {
    heading: string;
    blurb: string;
    href: string;
    icon: string;
    secondary?: boolean;
};

export default function Choice(props: ChoiceProps) {
    return (
        <div className={`col-sm-12 col-md-6 ${Styles.choiceCol}`}>
            <a
                href={props.href}
                className={`au-btn ${
                    props.secondary ? "au-btn--secondary" : ""
                } ${Styles.choiceButton}`}
            >
                <h2 className={Styles.buttonHeading}>{props.heading}</h2>{" "}
                <div className={Styles.choiceIconRow}>
                    <img className={`${Styles.choiceIcon}`} src={props.icon} />
                    {props.blurb}
                </div>
            </a>
        </div>
    );
}
