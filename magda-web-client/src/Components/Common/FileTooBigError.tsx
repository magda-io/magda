import React from "react";

import AUpageAlert from "pancake/react/page-alerts";

export default () => (
    <AUpageAlert as="error" className="notification__inner">
        <h3>Oops</h3>
        <p>
            Preview not available because either the data file is too big, or
            because we couldn't determine how big it is.
        </p>
    </AUpageAlert>
);
