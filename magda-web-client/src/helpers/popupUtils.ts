import getBoolQsParam from "./getBoolQsParam";
import { Location } from "history";

export const inPopUpMode = (
    location?: Location,
    defaultValue: boolean = false
) => getBoolQsParam("popup", location, defaultValue);

const hasSettingsRecordsPath = (str: string) =>
    /\/settings\/records(?:[\/?#]|$)/.test(str);

export const showSideNav = (location?: Location) => {
    const inPopUp = inPopUpMode(location);
    if (!inPopUp) {
        // if not in pop up mode, side nav should always be shown
        return true;
    }
    const noNav = getBoolQsParam<boolean | null>("noNav", location, null);
    if (noNav !== null) {
        // if noNav is explicitly set, return its value
        return !noNav;
    }

    const pathname = location?.pathname || "";
    if (hasSettingsRecordsPath(pathname)) {
        // special case for registry records page for keeping existing behaviour
        // default not show side nav in registry records page
        return false;
    } else {
        // for other pages, side nav should be shown by default
        // unless noNav is explicitly set to true or 1
        return true;
    }
};

export function getUrlWithPopUpQueryString(
    url: string,
    location?: Location
): string {
    if (!inPopUpMode(location)) {
        return url;
    }
    const shouldShowSideNav = showSideNav(location);
    const qsPos = url.indexOf("?");
    const urlWithoutQs = qsPos === -1 ? url : url.substring(0, qsPos);
    const urlQs = qsPos === -1 ? "" : url.substring(qsPos);
    const popupParams = new URLSearchParams(urlQs);
    popupParams.delete("popup");
    popupParams.delete("noNav");
    const newQs = popupParams.toString();
    const extraQsItems: string[] = ["popup"];
    extraQsItems.push(`${shouldShowSideNav ? "noNav=false" : "noNav"}`);
    const extraQs = extraQsItems.join("&");
    return newQs
        ? `${urlWithoutQs}?${newQs}&${extraQs}`
        : `${urlWithoutQs}?${extraQs}`;
}
