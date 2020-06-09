import queryString from "query-string";

type Props = {
    location: Location;
};

export default function (props: Props): number {
    return queryString.parse(props.location.search).page;
}
