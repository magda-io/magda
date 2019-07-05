ALTER TABLE public.recordaspects
    ADD COLUMN authpolicyview character varying NOT NULL DEFAULT 'object.registry.aspect.public'::character varying;;
CREATE INDEX recordaspects_authpolicyview_idx
    ON public.recordaspects USING btree;

ALTER TABLE public.recordaspects
    ADD COLUMN authpolicyedit character varying NOT NULL DEFAULT 'object.registry.aspect.public'::character varying;;
CREATE INDEX recordaspects_authpolicyview_idx
    ON public.recordaspects USING btree;