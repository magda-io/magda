import React from "react";

export const DEFAULT_OPEN_STATUS = false;

const CollapseBoxContext = React.createContext(DEFAULT_OPEN_STATUS);

export default CollapseBoxContext;
