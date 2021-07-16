import urijs from "urijs";

function appendUrlSegments(url: string, segments: string[]) {
    url = url ? url : "";
    const uri = urijs(url);
    return uri
        .segmentCoded(
            uri
                .segmentCoded()
                .filter((item) => !!item)
                .concat(segments)
        )
        .toString();
}

export default appendUrlSegments;
