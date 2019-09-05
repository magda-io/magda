CREATE OR REPLACE VIEW private_records AS
    SELECT records.recordid, records.tenantid FROM records
    JOIN recordaspects USING (recordid, tenantid)
    WHERE recordaspects.aspectid = 'dataset-access-control' OR recordaspects.aspectid = 'esri-access-control';

ALTER TABLE private_records
    OWNER TO postgres;

GRANT ALL ON TABLE private_records TO postgres;
GRANT SELECT ON TABLE private_records TO client;

CREATE OR REPLACE VIEW public_records AS
    SELECT records.recordid, records.tenantid FROM records
    WHERE NOT (EXISTS (
     SELECT 1 FROM private_records
     WHERE records.recordid = private_records.recordid));


ALTER TABLE public_records
    OWNER TO postgres;

GRANT ALL ON TABLE public_records TO postgres;
GRANT SELECT ON TABLE public_records TO client;

