import React from "react";
import { config } from "../../config.js";

const Lozenge = () => {
    if (!config.homePageConfig || !config.homePageConfig.Lozenge) return null;
    return (
        <div className="homepage-lozenge">
            {
                <a href={config.homePageConfig.Lozenge.url}>
                    {config.homePageConfig.Lozenge.text}
                </a>
            }
        </div>
    );
};

export default Lozenge;
