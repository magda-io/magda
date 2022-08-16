import React from "react";

const noop = () => {};

const Tabs = (props) => {
    let { onChange } = props;
    if (typeof onChange !== "function") onChange = noop;
    return (
        <nav className="tab-navigation">
            <div className="tab-list clearfix">
                <button
                    key={1}
                    role="presentation"
                    className={`tab-list-item ${
                        props.activeTabIndex === 0 ? "active" : ""
                    }`}
                    onClick={() => onChange(0)}
                >
                    Specify region
                </button>
                <button
                    key={2}
                    role="presentation"
                    className={`tab-list-item ${
                        props.activeTabIndex === 1 ? "active" : ""
                    }`}
                    onClick={() => onChange(1)}
                >
                    Specify coordinates
                </button>
            </div>
        </nav>
    );
};

export default Tabs;
