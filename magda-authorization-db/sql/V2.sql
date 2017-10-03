\connect auth
\set adminUserId `echo $DEFAULT_ADMIN_USER_ID`

INSERT INTO public.users ("id", "displayName", email, "photoURL", source, "sourceId", "isAdmin") 
VALUES (:'adminUserId', 'admin', 'admin@admin.com', 'http://example.com', 'manual', '1', true);