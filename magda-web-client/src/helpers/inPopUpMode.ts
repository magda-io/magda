import urijs from "urijs";

const inPopUpMode = () => {
    const uri = urijs(window.location.href);
    const params = uri.search(true);
    if (!params) return false;
    return Object.keys(params).indexOf("popup") > -1;
};

export default inPopUpMode;
