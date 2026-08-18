GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "user_roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "user_roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "user_roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));