# Acesso mediante autorização



Administrador: empresaalob@gmail.com (conta Supabase com e-mail confirmado).



## Ativação



1. No projeto Arsenal Express, execute `supabase/migrations/20261122_system_access_approval.sql` no SQL Editor. A migração mantém as regras de propriedade e adiciona a aprovação obrigatória. Ela rejeita substituir um hook Data API preexistente sem composição explícita.

2. Em Authentication > Providers > Email, mantenha a confirmação de e-mail habilitada. Autorizar um endereço não substitui confirmar sua propriedade.

3. Em Authentication > Hooks, habilite **Before User Created** com a função PostgreSQL `public.system_access_signup_hook` e **Custom Access Token** com `public.system_access_token_hook`.

4. Publique o aplicativo somente depois de aplicar a migração. O aplicativo nega acesso se a verificação não estiver disponível.

5. Entre com empresaalob@gmail.com e abra **Autorizar acessos** (`/admin/users`). Cadastre o e-mail recebido. A pessoa pode então criar sua conta, confirmar o e-mail e entrar.



Revogar um e-mail bloqueia páginas, APIs, Data API/RPC, Realtime e operações autenticadas no Storage, inclusive para sessões anteriores. O hook de token também impede novos logins e renovações. O administrador não pode revogar o próprio acesso.



As solicitações usam um link de e-mail para empresaalob@gmail.com. Resend não é necessário e nenhuma chave de envio deve ser colocada no navegador ou no repositório.



## Verificação



`node --test tests/systemAccess.test.cjs` executa PostgreSQL isolado com RLS real. Verifica autorização, preservação de propriedade, revogação, tentativa de autopromoção, confirmação de e-mail, hooks Auth e bloqueio da Data API. Não usa contas ou arquivos reais.



## Atenção a futuras migrações



Novas tabelas precisam de RLS e da policy restritiva `system_approval_required`. Não remova o pre-request hook sem incluir uma verificação equivalente nas RPCs SECURITY DEFINER. Alterações em outros hooks existentes devem ser compostas, e não sobrescritas.


## Pedidos no frontend

Antes de publicar, aplique `supabase/migrations/20261123_access_requests.sql`. O visitante abre `/request-access`, informa nome e e-mail e guarda o código UUID para consultar o status. O administrador aprova ou recusa em `/admin/users`. Aprovar concede acesso; a pessoa ainda cria e confirma sua conta. Não há envio automático de e-mails.

As RPCs públicas expõem apenas envio e consulta por código. A tabela é visível somente ao administrador. Envios são limitados a um por e-mail por hora e 100 no total por hora.
