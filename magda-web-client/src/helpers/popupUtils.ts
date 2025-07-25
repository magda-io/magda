import { useLocation } from "react-router-dom";

export const inPopUpMode = () => {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    if (!params.size) return false;
    return params.has("popup");
};

export const createPopupModeQueryString = () => {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    if (!params.size || !params.has("popup")) return "";
    const popupParams = new URLSearchParams();
    popupParams.append("popup", "true");
    return popupParams.toString();
};

export function useInPopUp() {
    const location = useLocation();
    if (!location?.search) {
        return false;
    }
    const params = new URLSearchParams(location.search);
    if (!params.size) {
        return false;
    }
    return params.has("popup");
}

export function usePopUpQueryString() {
    const location = useLocation();
    if (!location?.search) {
        return "";
    }
    const params = new URLSearchParams(location.search);
    if (!params.size || !params.has("popup")) {
        return "";
    }
    const popupParams = new URLSearchParams();
    popupParams.append("popup", "true");
    const datasetSubmitCallback = params.get("datasetSubmitCallback");
    if (datasetSubmitCallback) {
        popupParams.append("datasetSubmitCallback", datasetSubmitCallback);
    }
    return popupParams.toString();
}
