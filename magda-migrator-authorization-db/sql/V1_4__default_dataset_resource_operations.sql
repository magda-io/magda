-- Resources & Operations for Draft Dataset
WITH rows AS (
	INSERT INTO "public"."resources" ("uri", "name", "description") 
	VALUES 
	('object/dataset/draft', 'Draft Datasets', 'Datasets in draft status')
	RETURNING id
)
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/dataset/draft/read','Read Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/create', 'Create Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/update', 'Update Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/delete', 'Delete Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/publish', 'Publish Draft Dataset', '', (SELECT id FROM rows));

-- Resources & Operations for Published Dataset
WITH rows AS (
	INSERT INTO "public"."resources" ("uri", "name", "description") 
	VALUES 
	('object/dataset/published', 'Published Datasets', 'Datasets in non-draft (published) status')
	RETURNING id
)
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/dataset/published/unpublish','Unpublish Published Dataset', '', (SELECT id FROM rows)),
('object/dataset/published/updateLicenseInfo', 'Update Published Dataset (License Info Only)', '', (SELECT id FROM rows)),
('object/dataset/published/updateNonLicenseInfo', 'Update Published Dataset (Non-License Info Only)', '', (SELECT id FROM rows)),
('object/dataset/published/read', 'Read Publish Dataset', '', (SELECT id FROM rows));