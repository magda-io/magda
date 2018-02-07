import { Maybe } from "tsmonad";

export default function arrayToMaybe<T>(rows: T[]): Maybe<T> {
    return rows.length > 0 ? Maybe.just(rows[0]) : Maybe.nothing<T>();
}
