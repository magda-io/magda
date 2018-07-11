import React from "react";
import { Link } from "react-router-dom";
import { config } from "../../config.js";

const Lozenge = () => {
    if (!config.homePageConfig || !config.homePageConfig.Lozenge) return null;
    return (
        <div className="homepage-lozenge">
            {
                <Link to={config.homePageConfig.Lozenge.url}>
                    {config.homePageConfig.Lozenge.text}
                </Link>
            }
        </div>
    );
};

export default Lozenge;
