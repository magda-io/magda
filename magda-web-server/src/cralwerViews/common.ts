import moment from "moment";

export function printDate(str?: string) {
    if (!str || typeof str !== "string") {
        return "N/A";
    }
    const m = moment(str);
    if (!m.isValid()) {
        return "N/A";
    }
    return m.format("DD/MM/YYYY");
}
