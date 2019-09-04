CREATE OR REPLACE VIEW public.private_records AS
    SELECT records.recordid, records.tenantid FROM records
    JOIN recordaspects USING (recordid, tenantid)
    WHERE recordaspects.aspectid = 'dataset-access-control' OR recordaspects.aspectid = 'esri-access-control';

ALTER TABLE public.private_records
    OWNER TO postgres;

GRANT ALL ON TABLE public.private_records TO postgres;
GRANT SELECT ON TABLE public.private_records TO client;

CREATE OR REPLACE VIEW public.public_records AS
    SELECT records.recordid, records.tenantid FROM records
    WHERE NOT (EXISTS (
     SELECT 1 FROM private_records
     WHERE records.recordid = private_records.recordid));


ALTER TABLE public.public_records
    OWNER TO postgres;

GRANT ALL ON TABLE public.public_records TO postgres;
GRANT SELECT ON TABLE public.public_records TO client;

