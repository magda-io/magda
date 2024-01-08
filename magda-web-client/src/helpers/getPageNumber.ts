import queryString from "query-string";

type Props = {
    location: Location;
};

function getPageNumber(props: Props): number {
    return queryString.parse(props.location.search).page;
}

export default getPageNumber;
