import React from "react";

const noop = () => {};

type ContextType = {
    setIsOpen: (boolean) => void;
};

const OverlayBoxContext = React.createContext<ContextType>({
    setIsOpen: noop
});

export default OverlayBoxContext;
