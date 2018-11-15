INSERT INTO public.content
SELECT 'page/' || substring(id, 'staticPages/(.*).md') AS id,
       'application/json' AS type,
       '{"title": "' || substring(content, '---\n*title: *(.*)\n---') || '","content": "' || regexp_replace(substring(content, '---.*---(.*)'), E'[\\n\\r]+', '\n', 'g' ) || '"}' AS content
FROM public.content
WHERE id LIKE 'staticPages/%';

DELETE
FROM public.content
WHERE id LIKE 'staticPages/%';
