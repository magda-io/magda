// creates the path of a directed graph based on the hierarchial structure in the formatClassifications json file.
// the amount a path's length decays by as you go deeper into the hierarchy of the json object.
//paths:
// {
// paths: [{ edge: (pdf, doc), distance: 1.883}]
//
//
//
//
//
//
// should run every time formatClassifications.json is changed
// TODO optimise algos so they aren't all n^2 and optimise algos so that we don't need the unduplicator for the diffcategory method
// NOTE: constraint, you have to have at least 2 formats in 1 category, if you have more time, change this.
export default function getPathsAsJson(formatClassifications: any): any {
    let a = getPaths(formatClassifications);
    a;
    return JSON.stringify(getPaths(formatClassifications));
}

export function getPaths(formatClassifications: any): Edge[] {
    if (
        !formatClassifications ||
        !formatClassifications["categories"] ||
        formatClassifications["categories"].length < 1
    ) {
        throw new Error(
            "either the formatsclassifications json is null, or the categories inside that json are null or empty"
        );
    } else {
        let allEdges: Edge[] = [];
        for (let i = 0; i < formatClassifications["categories"].length; i++) {
            if (!isCategory(formatClassifications["categories"][i])) {
                throw new Error(
                    "the object:" +
                        formatClassifications["categories"][i] +
                        " is meant to be a category"
                );
            }

            allEdges = [].concat(
                allEdges,
                getPathsHelper(formatClassifications["categories"][i], 0)
            );
        }

        return unduplicated(allEdges);
    }
}

export function getPathsHelper(currentCategory: any, depth: number): Edge[] {
    if (!currentCategory || !currentCategory["formats"] || currentCategory["formats"].length < 0) {
        throw new Error(
            "the formats field is null or empty in the category:" +
                currentCategory
        );
    }

    let currentTopLevelCategories: PathByCategory[] = [];
    let currentTopLevelFormats: string[] = [];
    for (let i = 0; i < currentCategory["formats"].length; i++) {
        if (isCategory(currentCategory["formats"][i])) {
            currentTopLevelCategories.push({
                category: currentCategory["title"],
                paths: getPathsHelper(currentCategory["formats"][i], depth++)
            });
        } else if (isFormat(currentCategory["formats"][i])) {
            currentTopLevelFormats.push(currentCategory["formats"][i].name);
        } else {
            throw new Error(
                "the object: " + currentCategory["formats"][i] + " is malformed"
            );
        }
    }

    let categoryEdges: Edge[] = [];
    let flatEdges: Edge[] =
        currentTopLevelFormats && currentTopLevelFormats.length > 0
            ? buildFlatPaths(currentTopLevelFormats, depth)
            : [];

    // if categories exist then populate the var with it
    if (currentTopLevelCategories && currentTopLevelCategories.length > 0) {
        categoryEdges = currentTopLevelCategories[0].paths;
        for (let i = 0; i < currentTopLevelCategories.length - 1; i++) {
            categoryEdges = [].concat(
                categoryEdges,
                buildDifferentCategoryPaths(
                    currentTopLevelCategories[i].paths,
                    currentTopLevelCategories[i + 1].paths
                )
            );
        }
    }
    let a = buildHierarchyPaths(categoryEdges, flatEdges, currentCategory);
    a;
    return unduplicated(
        buildHierarchyPaths(categoryEdges, flatEdges, currentCategory)
    );
}

// combine paths on 2 different levels but same category: image and raster image
export function buildHierarchyPaths(
    topLevelHierarchyPaths: Path[],
    nestedPaths: Path[],
    highestObject?: any
): Path[] {
    let combinedEdges: Edge[] = [];

    if (!topLevelHierarchyPaths || topLevelHierarchyPaths.length < 1) {
        return nestedPaths;
    } else if (!nestedPaths || nestedPaths.length < 1) {
        return topLevelHierarchyPaths;
    } else {
        topLevelHierarchyPaths.forEach(function(topPath: Path) {
            nestedPaths.forEach(function(nestedPath: Path) {
                //TODO change this if it needs changing
                if (
                    topPath.indexOf(nestedPath[0]) > -1 ||
                    topPath.indexOf(nestedPath[1]) > -1
                ) {
                    throw new Error(
                        "inside the formatClassifications, it was detected that a format above hierarchy, is the same as a format below: " +
                            nestedPath[0] +
                            " " +
                            nestedPath[1] +
                            " the object:" +
                            highestObject +
                            " this doesn't make sense and is not allowed. Make a separate category above this category's level to put intersecting formats"
                    );
                } else {
                    // [pdf, doc, 2] [img, png, 1] --> [pdf, img, 2], [pdf, png, 2], [doc, img, 2], [doc, png, 2]
                    let deepestDepth =
                        topPath[3] > nestedPath[3] ? topPath[3] : nestedPath[3];
                    combinedEdges.push(
                        [topPath[0], nestedPath[0], topPath[2], deepestDepth],
                        [topPath[1], nestedPath[0], topPath[2], deepestDepth],
                        [topPath[0], nestedPath[1], topPath[2], deepestDepth],
                        [topPath[1], nestedPath[1], topPath[2], deepestDepth]
                    );
                }
            });
        });
        return unduplicated(combinedEdges);
    }
}

// build all paths on same level: all video formats
// shouldn't duplicate (have 2 or more edges that point to the same 2 formats)
export function buildFlatPaths(formats: string[], depth: number): Path[] {
    let paths: Path[] = [];

    for (let i = 0; i < formats.length; i++) {

        let destinations: destination[] = [];
        for (let j = i + 1; j < formats.length; j++) {
            destinations.push([formats[j], 1])
        }

        paths.push({
            from: formats[i],
            to: destinations 
        })
    }

    return paths;
}

// build all paths from 2 different categories, assuming this isn't the root category and all nested paths are already built.
// formats are allowed to appear twice
export function buildDifferentCategoryPaths(
    allFirstCategoryPaths: Edge[],
    allSecondCategoryPaths: Edge[]
) {
    let combinedEdges: Edge[] = [];
    allFirstCategoryPaths.forEach(function(firstCategoryEdge) {
        allSecondCategoryPaths.forEach(function(secondCategoryEdge) {
            //TODO which way should it be? largest or smallest should be distance?
            let largestDepth =
                firstCategoryEdge[3] > secondCategoryEdge[3]
                    ? firstCategoryEdge[3]
                    : secondCategoryEdge[3];
            let distance = getLocalDistance(
                firstCategoryEdge[3] > secondCategoryEdge[3]
                    ? firstCategoryEdge[2]
                    : secondCategoryEdge[2]
            );
            combinedEdges.push(
                [
                    firstCategoryEdge[0],
                    secondCategoryEdge[0],
                    distance,
                    largestDepth
                ],
                [
                    firstCategoryEdge[1],
                    secondCategoryEdge[0],
                    distance,
                    largestDepth
                ],
                [
                    firstCategoryEdge[0],
                    secondCategoryEdge[1],
                    distance,
                    largestDepth
                ],
                [
                    firstCategoryEdge[1],
                    secondCategoryEdge[1],
                    distance,
                    largestDepth
                ]
            );
        });
    });

    //combinedEdges now has the 2 different categories combined with their appropriate distances, now its time to add everything and return it
    combinedEdges = [].concat(
        combinedEdges,
        allFirstCategoryPaths,
        allSecondCategoryPaths
    );

    return unduplicated(combinedEdges);
}

// there may be multiple categories with multiple of the same edges in them. Check out description of overwriteEdge
export function unduplicated(edges: Edge[]): Edge[] {
    /*if (!edges || edges.length < 1) {
        return null;
    } else {
        let count = -1;
        return edges.filter(edge1 => {
            count++;
            return isDupWithList(edge1, edges.splice(count, 1));
        });
    }*/
    isDupWithList(edges[0], edges);
    return edges;
}

function isDupWithList(toTry: Edge, withList: Edge[]): boolean {
    if (withList.length < 1) {
        return true;
    } else if (
        withList[0].indexOf(toTry[0]) <= -1 ||
        (withList[1] && withList[1].indexOf(toTry[1])) <= -1 ||
        toTry[2] >= withList[0][2]
    ) {
        if (withList.length < 2) {
            return true;
        } else {
            return isDupWithList(toTry, withList.splice(0, 1));
        }
    } else {
        return false;
    }
}

// if another edge is found with the exact same formats, say a category called document, and a category called 'can be read by msword': doc, odt, it will return an average distance
export function overwriteEdge(originalEdge: Edge, replacementEdge: Edge) {
    if (
        originalEdge.indexOf(replacementEdge[0]) < 0 &&
        originalEdge.indexOf(replacementEdge[1]) < 0
    ) {
        throw new Error(
            "overwriteEdge function is only for edges that only differ in distance, not actual formats:" +
                replacementEdge +
                " and " +
                originalEdge +
                " are the same edge"
        );
    } else {
        return [
            originalEdge[0],
            originalEdge[1],
            (originalEdge[2] + replacementEdge[2]) / 2
        ];
    }
}

export function getLocalDistance(depth: number): number {
    return depth / (depth + 1);
}

export function isCategory(testObject: any): boolean {
    return (
        testObject.hasOwnProperty("title") &&
        testObject.hasOwnProperty("formats")
    );
}

export function isFormat(testObject: any): boolean {
    return testObject.hasOwnProperty("name");
}

export interface PathByCategory {
    category: "string";
    paths: Path[];
}

// format1, format2, distance, depth of deepest format
export type Edge = [string, string, number, number];
export type destination = [string, number];

export interface Path {
    from: string,
    to: destination[]
}
