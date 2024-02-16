function getDateString(dateString: string) {
    if (dateString) {
        const date = new Date(dateString);
        if (isValidDate(date)) {
            return date.toLocaleString("en-GB", {
                day: "numeric",
                month: "numeric",
                year: "numeric"
            });
        }
    }
    return undefined;
}

export default getDateString;

// https://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
export function isValidDate(date: Date) {
    return date instanceof Date && !isNaN(date.getTime());
}
