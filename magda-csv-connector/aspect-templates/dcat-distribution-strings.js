const { fuzzy, dates } = libraries;

let title = fuzzy.findClosestField(dataset, "title");

let license = fuzzy.findClosestFieldThreshold(
    distribution,
    0.5,
    "license type",
    "licensing"
);

let rights = fuzzy.findClosestFieldThreshold(
    distribution,
    0.5,
    "authorization for data collection"
);

let accessURL = fuzzy.findClosestFieldThreshold(
    distribution,
    0.5,
    "published location"
);

let accessNotes = fuzzy.findClosestFieldThreshold(
    distribution,
    0.5,
    "path",
    "data available @"
);

let downloadURL = fuzzy.findClosestFieldThreshold(
    distribution,
    0.5,
    "internal location"
);

let format = fuzzy.findClosestFieldThreshold(distribution, 0.5, "format");

return {
    title,
    license,
    rights,
    accessURL,
    accessNotes,
    downloadURL,
    format
};
