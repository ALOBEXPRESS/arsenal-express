# 📦 Pacote TikTok Scheduler - Arsenal Express

## 🎯 Objetivo

Criei um **prompt personalizado completo** para outra IA construir um agendador de postagens TikTok integrado ao **Arsenal Express**, mantendo 100% a identidade visual do seu projeto.

---

## 📁 Arquivos Criados (em `/docs`)

### 1️⃣ **PROMPT_TIKTOK_SCHEDULER.md** (10KB)
O prompt técnico completo com:
- ✅ Requisitos funcionais detalhados (3 tabs: Accounts, Posts, Analytics)
- ✅ Stack técnica (Next.js 15, PostZen API, Supabase)
- ✅ Database schema SQL completo
- ✅ Estrutura de arquivos sugerida
- ✅ Exemplos de código PostZen SDK
- ✅ Security guidelines
- ✅ Testing checklist

### 2️⃣ **UI_REFERENCE_ARSENAL_EXPRESS.md** (6KB)
Guia completo de design system:
- 🎨 Paleta de cores (pink #fe2c55, cyan #25f4ee, ink #232235, orange #ff4b26)
- 📐 Layout patterns (dashboard structure, headers)
- 🎭 Componentes assinatura (tally, eyebrow, panel, glow-pink)
- ✨ Animações (rise-in, grain texture)
- 🔤 Tipografia (font-display, font-mono)
- 🎯 Brand voice e copy guidelines

### 3️⃣ **CODE_SAMPLES_ARSENAL.md** (13KB)
Exemplos de código real do projeto:
- 💻 Button component customizado (shadcn/ui)
- 📄 Dashboard page pattern
- 🔐 Protected layout pattern
- 🎣 React Query hooks
- 📦 TypeScript types
- 🗄️ Supabase client setup
- 🎯 Modal component pattern
- 📱 Empty state pattern

### 4️⃣ **ENVIAR_PARA_IA.md** (5KB)
Arquivo resumo com instruções para a outra IA:
- 📚 Ordem de leitura dos arquivos
- 🚀 O que precisa fazer (backend, frontend, database)
- ⚠️ Regras importantes (pode/não pode fazer)
- ✅ Checklist de entrega
- 💬 FAQ

---

## 🎬 Como Usar

### Opção 1: Prompt Compacto (Artifact)
Use o **artifact gerado** que já está otimizado e pronto para copiar/colar em outra IA. Ele contém:
- Stack técnica
- Design system resumido
- Funcionalidades (3 tabs)
- Database schema
- Exemplo de código
- Links PostZen
- Checklist

### Opção 2: Prompt Detalhado (Arquivos)
Envie os 3 arquivos principais para a IA:
1. `PROMPT_TIKTOK_SCHEDULER.md` (requisitos técnicos)
2. `UI_REFERENCE_ARSENAL_EXPRESS.md` (design system)
3. `CODE_SAMPLES_ARSENAL.md` (exemplos de código)

Adicione a instrução:
> "Leia estes 3 arquivos na ordem e crie um agendador TikTok que se integre perfeitamente ao Arsenal Express. Siga 100% o design system."

---

## ✨ Diferenciais do Prompt

### 1. **Zero Variáveis Sensíveis**
- ✅ Apenas placeholders (`POSTZEN_API_KEY=pk_COLE_SUA_CHAVE_AQUI`)
- ✅ Instruções claras sobre `.env.example`
- ✅ Sem tokens, credentials ou keys reais

### 2. **100% Arsenal Express Compliant**
- 🎨 Paleta de cores extraída do `tailwind.config.ts` real
- 🎭 Componentes assinatura (`tally`, `eyebrow`, `panel`, `glow-pink`)
- ✨ Animações (`animate-rise-in`, `grain`)
- 📐 Layout patterns idênticos ao dashboard existente

### 3. **Arquitetura Consistente**
- 📁 Estrutura de arquivos alinhada com o projeto
- 🔄 React Query hooks no mesmo padrão
- 🗄️ Schema Supabase com RLS policies
- 🎯 TypeScript types tipados corretamente

### 4. **Exemplos de Código Reais**
- 💯 Código extraído do projeto Arsenal Express real
- 🔍 Analisado via MCP `code-review-graph`
- ✅ Patterns validados e funcionais

---

## 🎨 Preview do Design

### Paleta Arsenal Express
```
Rosa Vibrante:  #fe2c55  (primary, destaques)
Azul Cyan:      #25f4ee  (sync, narração, sucesso)
Preto Ink:      #232235  (superfícies, painéis)
Laranja Express:#ff4b26  (tally, badges, "Express")
```

### Componentes Assinatura
```tsx
// Tally light (LED laranja com glow)
<span className="tally" aria-hidden />

// Eyebrow (rótulo superior mono uppercase)
<p className="eyebrow flex items-center gap-2">
  <span className="tally" /> TikTok Scheduler
</p>

// Panel (card container)
<div className="panel">{/* conteúdo */}</div>

// Pink Glow Button (CTA principal)
<Button className="glow-pink">Ação Principal</Button>
```

---

## 📋 Checklist de Entrega Esperada

### Backend (Node.js)
- [ ] Server Express/Fastify rodando
- [ ] PostZen SDK integrado
- [ ] Rotas: `/accounts`, `/posts`, `/analytics`
- [ ] Conexão Supabase
- [ ] `.env.example` com placeholders
- [ ] README com instruções

### Frontend (Next.js)
- [ ] Página `/tiktok` no dashboard
- [ ] 3 tabs (Accounts, Posts, Analytics)
- [ ] Design 100% Arsenal Express
- [ ] React Query hooks
- [ ] Loading/error states
- [ ] TypeScript sem erros

### Database (Supabase)
- [ ] Migrations SQL aplicadas
- [ ] Tabelas: `tiktok_accounts`, `tiktok_posts`
- [ ] RLS policies configuradas
- [ ] Types TypeScript gerados

---

## 🔗 Links Úteis (Para a IA)

- PostZen API: https://docs.postzen.dev/api-reference
- PostZen TikTok: https://docs.postzen.dev/platforms/tiktok
- PostZen Node SDK: https://github.com/postzen-dev/postzen-node

---

## 💡 Dicas Para Você

### Quando Enviar o Prompt
1. **Cole o artifact** OU anexe os 3 arquivos principais
2. Adicione: "Minha API key PostZen: `[sua_key_aqui]`" (depois que tiver)
3. Se precisar, forneça: "Minhas credenciais Supabase já estão em `web/.env.local`"

### Testando o Resultado
1. Verifique se o design tem a cara do Arsenal Express (rosa, cyan, tally, eyebrow)
2. Teste OAuth do TikTok (conectar conta)
3. Crie um post agendado
4. Verifique analytics

### Se Algo Não Estiver Alinhado
- Compare com `UI_REFERENCE_ARSENAL_EXPRESS.md`
- Peça para a IA ajustar cores/componentes específicos
- Use os `CODE_SAMPLES_ARSENAL.md` como referência

---

## 🎬 Próximos Passos

1. ✅ **Arquivos criados** (você está aqui!)
2. ⏳ **Enviar prompt** para outra IA
3. ⏳ **Receber código** backend + frontend
4. ⏳ **Integrar** no Arsenal Express
5. ⏳ **Testar** com sua API key PostZen
6. ⏳ **Deploy** 🚀

---

## 🙋 Precisa de Ajuda?

Se a IA gerar código que não segue o design Arsenal Express:
1. Mostre os arquivos de referência
2. Peça ajustes específicos ("use a cor `--brand-pink` aqui")
3. Cole exemplos do `CODE_SAMPLES_ARSENAL.md`

---

**Arsenal Express Team** 🎥✨  
*AI-Powered Video Production Platform*

Criado usando **code-review-graph MCP** para extrair padrões reais do projeto.
