import React, { FunctionComponent, ReactElement } from "react";
import { Link, withRouter } from "react-router-dom";
import { Location } from "history";
import urijs from "urijs";
import "./Breadcrumb.scss";

type BreadcrumbItem = { to?: string; title: string };

type PropsType = {
    items: BreadcrumbItem[];
    leadingItem?: BreadcrumbItem;
    location: Location;
};

function isCurrentPage(location: Location, item: BreadcrumbItem) {
    if (!item?.to) {
        return false;
    }
    const itemUri = urijs(item.to);
    if (location.pathname === itemUri.pathname()) {
        return true;
    } else {
        return false;
    }
}

const defaultLeadingItem = {
    title: "Settings"
} as BreadcrumbItem;

const Breadcrumb: FunctionComponent<PropsType> = (props) => {
    const { items, location, leadingItem: suppliedLeadingItem } = props;
    const leadingItem = suppliedLeadingItem
        ? suppliedLeadingItem
        : defaultLeadingItem;
    return (
        <div className="breadcrumb">
            <span className="breadcrumb-container">
                {[leadingItem, ...items]
                    .map((item, idx) => (
                        <span key={idx} className="breadcrumb-item">
                            {item?.to && !isCurrentPage(location, item) ? (
                                <Link to={item.to}>{item.title}</Link>
                            ) : (
                                item.title
                            )}
                        </span>
                    ))
                    .reduce((newItems, currentItem, idx) => {
                        if (newItems.length) {
                            return [
                                ...newItems,
                                <span
                                    key={`sep_${idx}`}
                                    className="breadcrumb-separator"
                                >
                                    {"/"}
                                </span>,
                                currentItem
                            ];
                        } else {
                            return [...newItems, currentItem];
                        }
                    }, [] as ReactElement[])}
            </span>
        </div>
    );
};

export default withRouter(Breadcrumb);
