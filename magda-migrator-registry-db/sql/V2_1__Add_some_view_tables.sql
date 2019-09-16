CREATE OR REPLACE VIEW private_records AS
    SELECT records.recordid, records.tenantid FROM records
    JOIN recordaspects USING (recordid, tenantid)
    WHERE recordaspects.aspectid = 'dataset-access-control' OR recordaspects.aspectid = 'esri-access-control';

CREATE OR REPLACE VIEW public_records AS
    SELECT records.recordid, records.tenantid FROM records
    WHERE NOT EXISTS (
	    SELECT 1 FROM private_records
	    WHERE (records.recordid, records.tenantid) = (private_records.recordid, private_records.tenantid));
