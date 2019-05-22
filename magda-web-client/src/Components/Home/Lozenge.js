import React from "react";
import { Link } from "react-router-dom";

const Lozenge = data => {
    if (!data || !data.content || !data.content.url || !data.content.text)
        return null;
    return (
        <div className="homepage-lozenge">
            {<Link to={data.content.url || "/"}>{data.content.text}</Link>}
        </div>
    );
};

export default Lozenge;
