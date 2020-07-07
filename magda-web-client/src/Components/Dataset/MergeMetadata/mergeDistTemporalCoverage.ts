import {
    Distribution,
    TemporalCoverage,
    Interval
} from "Components/Dataset/Add/DatasetAddCommon";

export const isEmptyOrInvalidTemporalInterval = (i?: Interval) =>
    !i || (!i?.end?.getDate && !i?.start?.getDate);

export const isEmptyOrInvalidTemporalIntervals = (i?: Interval[]) =>
    !i?.length || !i.find((item) => !isEmptyOrInvalidTemporalInterval(item));

function mergeTemporalIntervals(i1?: Interval[], i2?: Interval[]) {
    if (
        isEmptyOrInvalidTemporalIntervals(i1) &&
        isEmptyOrInvalidTemporalIntervals(i2)
    ) {
        return undefined;
    }
    if (isEmptyOrInvalidTemporalIntervals(i1)) {
        return i2;
    }
    if (isEmptyOrInvalidTemporalIntervals(i2)) {
        return i1;
    }
    i1 = i1!.filter((item) => !isEmptyOrInvalidTemporalInterval(item));
    i2 = i2!.filter((item) => !isEmptyOrInvalidTemporalInterval(item));

    const newIntervals = [...i1, ...i2] as Interval[];
    return newIntervals;
}

/**
 * Merge all temporalCoverage field of existing distributions to determine dataset temporalCoverage
 *
 * @export
 * @param {Distribution[]} dists
 * @returns {(TemporalCoverage | undefined)}
 */
export default function mergeDistTemporalCoverage(
    dists: Distribution[]
): TemporalCoverage | undefined {
    let intervals = [] as Interval[] | undefined;

    dists.forEach((item) => {
        if (item?.temporalCoverage?.intervals?.length) {
            intervals = mergeTemporalIntervals(
                intervals,
                item.temporalCoverage.intervals
            );
        }
    });

    if (!intervals?.length) {
        return;
    } else {
        return {
            intervals
        };
    }
}
