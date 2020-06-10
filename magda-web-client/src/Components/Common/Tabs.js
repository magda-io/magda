import React from "react";
import { NavLink } from "react-router-dom";
import "./Tabs.scss";

function Tabs(props) {
    // manully detect Nav link active link
    function checkActive(id, _, location) {
        if (location.pathname && location.pathname.search(id) >= 0) {
            return true;
        }
        return false;
    }
    return (
        <nav className="tab-navigation">
            <ul className="au-link-list">
                {props.list
                    .filter((i) => i.isActive)
                    .map((item) => (
                        <li role="presentation" key={item.id}>
                            <NavLink
                                activeClassName="mainmenu--active"
                                to={`${props.baseUrl}/${item.id}?${props.params}`}
                                onClick={() => {
                                    props.onTabChange(item.id);
                                }}
                                isActive={checkActive.bind(this, item.id)}
                            >
                                {item.name}
                            </NavLink>
                        </li>
                    ))}
            </ul>
        </nav>
    );
}

export default Tabs;
