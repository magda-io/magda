INSERT INTO public.content (id, type, content) VALUES ('header/navigation/drafts', 'application/json', '{"order":15,"default":{"label":"Drafts","href":"/drafts"}}') ON CONFLICT DO NOTHING;
