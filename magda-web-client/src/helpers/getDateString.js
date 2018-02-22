//@flow
export default function(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
        day: "numeric",
        month: "numeric",
        year: "numeric"
    });
}
