-- Insert blank values into these just so they'll show up in the admin ui for easy changes if necessary.
INSERT INTO public.content VALUES ('lang/en/datasetPage/accessNotesPrefix', 'text/plain', '') ON CONFLICT DO NOTHING;
INSERT INTO public.content VALUES ('lang/en/datasetPage/accessNotesSuffix', 'text/plain', '') ON CONFLICT DO NOTHING;
INSERT INTO public.content VALUES ('lang/en/datasetPage/contactPointTitle', 'text/plain', 'Contact Point') ON CONFLICT DO NOTHING;