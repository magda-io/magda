//@flow
export default function(dateString: string) {
    if (!dateString) {
        return "Unspecified Date";
    }
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
        day: "numeric",
        month: "numeric",
        year: "numeric"
    });
}
