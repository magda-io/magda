import { useLocation } from "react-router-dom";
import { Location } from "history";
import urijs from "urijs";

export function checkInPopUpStatus(location: Location) {
    const uri = urijs(location?.search);
    const queries = uri.search(true);
    if (typeof queries?.popup !== "undefined") {
        return true;
    } else {
        return false;
    }
}

function useInPopUp() {
    const location = useLocation();
    return checkInPopUpStatus(location);
}

export default useInPopUp;
