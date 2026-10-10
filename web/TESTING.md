# 🧪 Guia de Testes - Video Assembler Web Platform

## 📋 Pré-requisitos

1. ✅ Dependências instaladas (`npm install` ou `pnpm install`)
2. ✅ Supabase configurado (.env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY)
3. ✅ Banco de dados migrado (schema v2.0 aplicado)
4. ✅ Dev server rodando (`npm run dev`)

---

## 🚀 Passo 1: Instalar Dependências

Execute no PowerShell/CMD:

```bash
cd "h:\Projetos\Em desenvolvimento\Canal Youtube\GTAEXPRESSBR\workspace\web"

# Opção 1: npm (mais lento)
npm install

# Opção 2: pnpm (RECOMENDADO - muito mais rápido)
npm install -g pnpm
pnpm install
```

---

## 🔥 Passo 2: Iniciar Dev Server

```bash
# Com npm
npm run dev

# Com pnpm
pnpm dev
```

O servidor deve iniciar em: **http://localhost:3000**

---

## 🎭 Passo 3: Testar com Playwright MCP

### Teste 1: Página Inicial (Landing Page)

**Kiro Prompt:**
```
Load playwright tools and navigate to http://localhost:3000, take a screenshot and describe what you see
```

**Validações esperadas:**
- ✅ Página carrega sem erros
- ✅ Vê botões "Login" e "Sign Up"
- ✅ Design dark theme
- ✅ Layout responsivo

---

### Teste 2: Fluxo de Cadastro (Sign Up)

**Kiro Prompt:**
```
Using playwright:
1. Navigate to http://localhost:3000
2. Click on "Sign Up" button
3. Fill the form with:
   - email: test@example.com
   - password: Test123456!
   - confirm password: Test123456!
4. Click "Create Account"
5. Take screenshots of each step
6. Report any errors
```

**Validações esperadas:**
- ✅ Formulário de cadastro aparece
- ✅ Validação de campos funciona
- ✅ Senha deve ter 6+ caracteres
- ✅ Confirmar senha deve corresponder
- ✅ Após sucesso, redireciona para /dashboard
- ✅ Cria perfil automaticamente (trigger do Supabase)

**Verificar no Supabase:**
```sql
-- Ver usuário criado
SELECT * FROM auth.users WHERE email = 'test@example.com';

-- Ver perfil criado (trigger automático)
SELECT * FROM profiles WHERE email = 'test@example.com';
```

---

### Teste 3: Fluxo de Login

**Kiro Prompt:**
```
Using playwright:
1. Navigate to http://localhost:3000/login
2. Fill the form with:
   - email: test@example.com
   - password: Test123456!
3. Click "Sign In"
4. Take screenshot after login
5. Verify you're on /dashboard
```

**Validações esperadas:**
- ✅ Formulário de login aparece
- ✅ Credenciais corretas permitem login
- ✅ Redireciona para /dashboard
- ✅ Dashboard mostra dados do usuário

---

### Teste 4: Dashboard (Rota Protegida)

**Kiro Prompt:**
```
Using playwright:
1. Try to navigate to http://localhost:3000/dashboard WITHOUT login
2. Take screenshot
3. Then login and navigate to dashboard
4. Take another screenshot
5. Verify user menu shows email
```

**Validações esperadas:**
- ✅ Acesso sem login redireciona para /login (middleware)
- ✅ Após login, dashboard carrega
- ✅ Mostra email do usuário no header
- ✅ Menu "Projects", "Settings", "Sign Out" aparece
- ✅ Lista de projetos vazia (primeira vez)

---

### Teste 5: Logout

**Kiro Prompt:**
```
Using playwright:
1. Navigate to http://localhost:3000/login
2. Login with test@example.com / Test123456!
3. Click on user menu
4. Click "Sign Out"
5. Verify redirect to home page
6. Try to access /dashboard again
```

**Validações esperadas:**
- ✅ Logout funciona
- ✅ Redireciona para página inicial
- ✅ Dashboard não é acessível após logout
- ✅ Middleware protege rotas corretamente

---

## 🔍 Teste 6: RLS (Row Level Security)

### Teste manual via Supabase Studio:

1. **Acesse:** https://supabase.com/dashboard/project/neuxjrdlzhhfsojjajwy
2. **SQL Editor**, execute:

```sql
-- Como usuário autenticado (simular auth.uid())
SELECT * FROM profiles WHERE id = auth.uid();

-- Tentar criar projeto
INSERT INTO projects (title, description, mode, status)
VALUES ('Test Project', 'Testing RLS', 'upload', 'draft')
RETURNING *;

-- Verificar que só vê seus projetos
SELECT * FROM projects WHERE user_id = auth.uid();
```

**Validações esperadas:**
- ✅ Usuário só vê seus próprios dados
- ✅ Não consegue acessar dados de outros usuários
- ✅ INSERT adiciona user_id automaticamente
- ✅ UPDATE/DELETE só funciona para próprios registros

---

## 🎨 Teste 7: UI/UX

**Kiro Prompt:**
```
Using playwright, navigate through the entire app and take screenshots:
1. Home page
2. Login page
3. Signup page
4. Dashboard (after login)
5. Check responsive design by resizing browser
```

**Validações esperadas:**
- ✅ Design consistente (dark theme)
- ✅ Tailwind classes aplicadas corretamente
- ✅ Responsivo (mobile, tablet, desktop)
- ✅ Animações suaves
- ✅ Estados de loading funcionam
- ✅ Mensagens de erro claras

---

## 🐛 Troubleshooting

### Erro: "Failed to fetch"
- ✅ Verificar se dev server está rodando
- ✅ Verificar se .env.local existe e tem as variáveis corretas
- ✅ Verificar network tab no browser

### Erro: "Invalid API key"
- ✅ Verificar NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local
- ✅ Copiar novamente do Supabase Dashboard

### Erro: "Row Level Security policy violation"
- ✅ Verificar se migration foi aplicada
- ✅ Verificar RLS policies no Supabase Studio
- ✅ Re-executar migration se necessário

### Erro: "Profile not created"
- ✅ Verificar se trigger `handle_new_user` existe
- ✅ Re-aplicar migration completa
- ✅ Verificar logs no Supabase Dashboard

---

## 📊 Métricas de Sucesso

| Teste | Status | Tempo Esperado |
|-------|--------|----------------|
| Landing Page | ⏳ | < 1s |
| Sign Up | ⏳ | < 3s |
| Login | ⏳ | < 2s |
| Dashboard Load | ⏳ | < 2s |
| Logout | ⏳ | < 1s |
| RLS Protection | ⏳ | N/A |

---

## 🎯 Próximos Passos (Fase 3)

Após todos os testes passarem:

1. **Timeline Editor Component**
   - Drag & drop de cenas
   - Preview de vídeo/áudio
   - Ajuste de duração

2. **Project CRUD**
   - Criar novo projeto
   - Listar projetos
   - Editar projeto
   - Deletar projeto

3. **Asset Upload**
   - Upload de vídeos
   - Upload de áudios
   - Upload de imagens
   - Storage policies

4. **Scene Management**
   - Adicionar cenas
   - Ordenar cenas
   - Configurar transições
   - Preview de cena

---

## 📞 Suporte

Se algum teste falhar:
1. Copie o erro completo
2. Tire screenshot
3. Verifique console do browser (F12)
4. Peça ajuda ao Kiro com contexto completo

**Status Atual:** Aguardando instalação de dependências ⏳
