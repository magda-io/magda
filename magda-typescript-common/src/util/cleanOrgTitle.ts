export default function cleanOrgTitle(title: string) {
    if (!title) {
        return title;
    }
    if (typeof title !== "string") {
        title = String(title);
    }
    return title.replace(/^\W*/, "");
}
