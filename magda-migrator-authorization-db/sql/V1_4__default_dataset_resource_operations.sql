INSERT INTO "public"."resources" ("id", "name", "uri", "description") 
VALUES 
('1', 'Draft Datasets', 'object/draft_dataset', 'Datasets in draft status'),
('2', 'Published Datasets', 'object/published_dataset', 'Datasets in non-draft (published) status');

INSERT INTO "public"."operations" ("id", "name", "description", "resource_id") 
VALUES 
('1', 'Read Draft Dataset', '', '1'),
('2', 'Create Draft Dataset', '', '1'),
('3', 'Update Draft Dataset', '', '1'),
('4', 'Delete Draft Dataset', '', '1'),
('5', 'Publish Draft Dataset', '', '1'),
('6', 'Unpublish Published Dataset', '', '2'),
('7', 'Update Published Dataset (License Info Only)', '', '2'),
('8', 'Update Published Dataset (Non-License Info Only)', '', '2'),
('9', 'Read Publish Dataset', '', '2');