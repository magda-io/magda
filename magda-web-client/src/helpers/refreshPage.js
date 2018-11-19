import history from "../history";

export let refreshId = 0;

export default function refresh() {
    history.push({
        ...history.location,
        pathname: `/refresh${history.location.pathname}`
    });
    refreshId++;
}
