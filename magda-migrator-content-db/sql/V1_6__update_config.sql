UPDATE public.content
SET "id" = 'header/logo'
WHERE "id" = 'logo';

UPDATE public.content
SET "id" = 'header/logo-mobile'
WHERE "id" = 'logo-mobile';

INSERT INTO public.content (id, type, content) VALUES ('header/navigation/datasets', 'application/json', '{"order":10,"default":{"label":"Datasets","href":"/search"}}');
INSERT INTO public.content (id, type, content) VALUES ('header/navigation/orgs', 'application/json', '{"order":20,"default":{"label":"Organisations","href":"/organisations"}}');
INSERT INTO public.content (id, type, content) VALUES ('header/navigation/about', 'application/json', '{"order":30,"default":{"label":"About","href":"/page/about"}}');
INSERT INTO public.content (id, type, content) VALUES ('header/navigation/auth', 'application/json', '{"order":100,"auth":{}}');
