import React, { useState, FunctionComponent } from "react";
import "./CollapseBox.scss";
import CollapseBoxContext, { DEFAULT_OPEN_STATUS } from "./CollapseBoxContext";
import plusIcon from "assets/noun-plus.svg";
import minusIcon from "assets/noun-minus.svg";
import { withRouter, RouteComponentProps } from "react-router";
import { Link } from "react-router-dom";
import URI from "urijs";

interface PropsType extends RouteComponentProps {
    heading: string;
    isOpen?: boolean;
    stepNum: number;
    className?: string;
    isNotCollapsible?: boolean;
}

const CollapseBox: FunctionComponent<PropsType> = (props) => {
    const isNotCollapsible =
        typeof props?.isNotCollapsible === "undefined"
            ? false
            : props.isNotCollapsible;

    const [isOpen, setIsOpen] = useState(
        typeof props.isOpen === "boolean" ? props.isOpen : DEFAULT_OPEN_STATUS
    );

    const onToggleClick = () => {
        setIsOpen((isOpen) => (isOpen ? false : true));
    };

    return (
        <div
            className={`collapse-box row ${
                props.className ? props.className : ""
            }`}
        >
            <div className="col-sm-12">
                <div
                    className={
                        isNotCollapsible
                            ? "not-collapse-box-section-heading"
                            : "collapse-box-section-heading"
                    }
                >
                    {isNotCollapsible ? null : (
                        <img
                            alt="toggle button"
                            src={isOpen ? minusIcon : plusIcon}
                            onClick={onToggleClick}
                        />
                    )}

                    <Link
                        className="edit-link"
                        to={(() => {
                            const uri = new URI(window.location.href);
                            return new URI(
                                uri.segment(-1, "" + props.stepNum).path()
                            )
                                .search({ isBackToReview: null })
                                .toString();
                        })()}
                    >
                        Edit
                    </Link>

                    {isNotCollapsible ? (
                        <h3>{props.heading}</h3>
                    ) : (
                        <h3 onClick={onToggleClick}>{props.heading}</h3>
                    )}
                </div>
                <CollapseBoxContext.Provider value={isOpen}>
                    <div
                        className={`collapse-box-body ${
                            isOpen ? "uncollapsed-body" : "collapsed-body"
                        }`}
                    >
                        {props.children ? props.children : null}
                    </div>
                </CollapseBoxContext.Provider>
            </div>
        </div>
    );
};

const CollapseBoxWithRouter = withRouter(CollapseBox);

export default CollapseBoxWithRouter;
