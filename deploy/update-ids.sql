-- This is a manual script used once on data.gov.au to add an "id" member to the source of existing records.

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"act"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'ACT Government data.act.gov.au'; 

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"bom"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Australian Bureau of Meteorology' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"aims"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Australian Institute of Marine Science' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"aodn"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Australian Oceans Data Network' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"brisbane"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Brisbane City Council' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"hobart"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'City of Hobart Open Data Portal'; 

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"launceston"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'City of Launceston Open Data' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"marlin"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'CSIRO Marlin' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"dga"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'data.gov.au' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"esta"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'ESTA Open Data'; 

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"ga"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Geoscience Australia' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"logan"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Logan City Council' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"melbourne"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Melbourne Data' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"mrt"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Mineral Resources Tasmania' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"moretonbay"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Moreton Bay Regional Council Data Portal' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"neii"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'National Environmental Information Infrastructure' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"metoc"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Navy Meteorology and Oceanography (METOC) ' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"nsw"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'New South Wales Government' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"sdinsw"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'NSW Land and Property' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"qld"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Queensland Government' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"sa"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'South Australia Government' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"listtas"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Tasmania TheList' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"tern"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Terrestrial Ecosystem Research Network' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"vic"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Victoria Government' ;

UPDATE recordaspects
SET data = jsonb_set(data, '{id}', '"wa"')
WHERE aspectid = 'source' 
	AND data->>'name' = 'Western Australia Government' ;


