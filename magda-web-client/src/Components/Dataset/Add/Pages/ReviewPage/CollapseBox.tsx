import React, { useState, FunctionComponent } from "react";
import "./CollapseBox.scss";
import CollapseBoxContext, { DEFAULT_OPEN_STATUS } from "./CollapseBoxContext";
import plusIcon from "assets/noun-plus.svg";
import minusIcon from "assets/noun-minus.svg";
import { withRouter, RouteComponentProps } from "react-router";
import URI from "urijs";

interface PropsType extends RouteComponentProps {
    heading: string;
    isOpen?: boolean;
    stepNum: number;
    className?: string;
}

const CollapseBox: FunctionComponent<PropsType> = props => {
    const [isOpen, setIsOpen] = useState(
        typeof props.isOpen === "boolean" ? props.isOpen : DEFAULT_OPEN_STATUS
    );

    const onToggleClick = () => {
        setIsOpen(isOpen => (isOpen ? false : true));
    };

    return (
        <div
            className={`collapse-box row ${
                props.className ? props.className : ""
            }`}
        >
            <div className="col-sm-12">
                <div className="collapse-box-section-heading">
                    <img
                        src={isOpen ? minusIcon : plusIcon}
                        onClick={onToggleClick}
                    />
                    <button
                        className="au-btn"
                        onClick={() => {
                            const uri = new URI(location.href);
                            props.history.push(
                                new URI(
                                    uri.segment(-1, "" + props.stepNum).path()
                                )
                                    .search({ isBackToReview: null })
                                    .toString()
                            );
                        }}
                    >
                        Edit
                    </button>
                    <h3 onClick={onToggleClick}>{props.heading}</h3>
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
