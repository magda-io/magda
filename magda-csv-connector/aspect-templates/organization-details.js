const { fuzzy, dates } = libraries;

let title = [
    fuzzy.findClosestFieldThreshold(organization, 0.8, "division"),
    fuzzy.findClosestFieldThreshold(organization, 0.8, "branch"),
    fuzzy.findClosestFieldThreshold(organization, 0.8, "section")
]
    .filter(i => i)
    .join(" - ");

title =
    title ||
    fuzzy.findClosestFieldThreshold(
        organization,
        0.5,
        "primary source",
        "custodian"
    );

return {
    title
};
