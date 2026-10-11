-- 003 — Fecha funções SECURITY DEFINER expostas na API (advisor 0028/0029)
-- Aplicada em 11/10/2026 via Supabase MCP.

-- Função de trigger: ninguém deve chamá-la via /rest/v1/rpc
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Helpers de RLS: sem acesso anônimo. "authenticated" precisa manter EXECUTE porque as
-- policies avaliam a função com o papel de quem chama; ela só responde true/false sobre
-- projetos do próprio usuário (não expõe dados). Aviso 0029 restante é intencional.
revoke execute on function public.owns_project(uuid) from public, anon;
revoke execute on function public.owns_storage_path(text) from public, anon;
grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.owns_storage_path(text) to authenticated;
