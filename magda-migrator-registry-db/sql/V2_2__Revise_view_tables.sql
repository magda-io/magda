DROP VIEW public_records;
DROP VIEW private_records;

CREATE OR REPLACE VIEW records_with_access_control AS
    SELECT records.recordid, records.tenantid FROM records
    JOIN recordaspects USING (recordid, tenantid)
    WHERE recordaspects.aspectid = 'dataset-access-control' OR recordaspects.aspectid = 'esri-access-control';

CREATE OR REPLACE VIEW records_without_access_control AS
    SELECT records.recordid, records.tenantid FROM records
    WHERE NOT EXISTS (
	    SELECT 1 FROM records_with_access_control
	    WHERE (records.recordid, records.tenantid) = (records_with_access_control.recordid, records_with_access_control.tenantid));
