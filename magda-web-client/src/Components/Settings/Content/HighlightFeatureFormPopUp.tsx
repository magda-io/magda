import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useImperativeHandle,
    useState
} from "react";
import { useAsyncCallback } from "react-async-hook";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import DatePicker from "rsuite/DatePicker";
import Form from "rsuite/Form";
import Loader from "rsuite/Loader";
import { writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import {
    addDays,
    isFeaturedOn,
    parseLocalDateString,
    toLocalDateString
} from "helpers/homeHighlightRotation";
import {
    HighlightRecord,
    HIGHLIGHT_ID_PREFIX,
    setHighlightFeaturedUntil
} from "./homeUtils";

type PropsType = object;

export type RefType = {
    open: (
        record: HighlightRecord,
        options: {
            // all highlights: featuring one stops featuring the others
            records: HighlightRecord[];
            onComplete?: () => void;
        }
    ) => void;
};

/**
 * Feature a highlight: show it on the home page every day until a date, instead of the rotation.
 */
const HighlightFeatureFormPopUp: ForwardRefRenderFunction<
    RefType,
    PropsType
> = (props, ref) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [record, setRecord] = useState<HighlightRecord>();
    const [records, setRecords] = useState<HighlightRecord[]>([]);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [onComplete, setOnComplete] = useState<() => void>();

    const today = parseLocalDateString(toLocalDateString(new Date())) as Date;
    const isFeatured =
        !!record?.content &&
        isFeaturedOn(
            { key: record.key, featuredUntil: record.content.featuredUntil },
            today
        );

    useImperativeHandle(ref, () => ({
        open: (record, { records, onComplete }) => {
            setRecord(record);
            setRecords(records);
            const current = record.content?.featuredUntil
                ? parseLocalDateString(record.content.featuredUntil)
                : undefined;
            // default: the current end date, or today only
            setEndDate(current && current >= today ? current : today);
            // wrap the callback, as a function passed to a state setter is called
            setOnComplete(() => onComplete);
            setIsOpen(true);
        }
    }));

    const close = () => setIsOpen(false);

    const save = useAsyncCallback(async (featuredUntil?: string) => {
        if (!record) {
            return;
        }
        try {
            if (featuredUntil) {
                // only one highlight is featured at a time
                for (const item of records) {
                    if (
                        item.key !== record.key &&
                        item.content?.featuredUntil
                    ) {
                        await writeContent(
                            `${HIGHLIGHT_ID_PREFIX}${item.key}`,
                            setHighlightFeaturedUntil(item.content, undefined)
                        );
                    }
                }
            }
            await writeContent(
                `${HIGHLIGHT_ID_PREFIX}${record.key}`,
                setHighlightFeaturedUntil(record.content, featuredUntil)
            );
            setIsOpen(false);
        } catch (e) {
            reportError(`Failed to update the highlight: ${e}`);
        } finally {
            if (typeof onComplete === "function") {
                onComplete();
            }
        }
    });

    return (
        <Modal
            className="content-settings-form-popup highlight-feature-form-popup"
            backdrop="static"
            keyboard={false}
            open={isOpen}
            size="sm"
            onClose={close}
        >
            <Modal.Header>
                <Modal.Title>Feature Highlight</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {save.loading ? (
                    <Loader backdrop content="Saving..." vertical />
                ) : null}
                <p className="feature-intro">
                    Show the highlight
                    {record?.content?.text ? (
                        <b> "{record.content.text}"</b>
                    ) : null}{" "}
                    on the home page every day until the end date, instead of
                    the daily rotation. The rotation then continues as before.
                    Only one highlight can be featured at a time: featuring this
                    one stops featuring any other.
                </p>
                <Form fluid>
                    <Form.Group controlId="ctrl-featured-until">
                        <Form.ControlLabel>Feature until</Form.ControlLabel>
                        <DatePicker
                            oneTap
                            block
                            cleanable={false}
                            format="yyyy-MM-dd"
                            placement="bottomStart"
                            value={endDate}
                            onChange={(value) => setEndDate(value)}
                            shouldDisableDate={(date) => date < today}
                            ranges={[
                                { label: "Today", value: today },
                                {
                                    label: "1 week",
                                    value: addDays(today, 6)
                                }
                            ]}
                        />
                        <Form.HelpText>
                            Including this day, in the visitor's local time.
                        </Form.HelpText>
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                {isFeatured ? (
                    <Button
                        appearance="subtle"
                        className="stop-featuring-button"
                        disabled={save.loading}
                        onClick={() => save.execute(undefined)}
                    >
                        Stop featuring
                    </Button>
                ) : null}
                <Button
                    appearance="primary"
                    disabled={!endDate || save.loading}
                    onClick={() =>
                        endDate && save.execute(toLocalDateString(endDate))
                    }
                >
                    {isFeatured ? "Update" : "Feature"}
                </Button>
                <Button onClick={close} disabled={save.loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(HighlightFeatureFormPopUp);
