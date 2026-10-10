# Arsenal Express - Web Platform

**Framework:** Next.js 15 + React 19  
**Styling:** Tailwind CSS + Dark Theme  
**Auth:** Supabase Auth  
**State:** Zustand + TanStack Query  

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and add your Supabase keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://neuxjrdlzhhfsojjajwy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Structure

```
web/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   └── renders/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── video/
│   ├── audio/
│   └── timeline/
├── lib/
│   ├── supabase/
│   │   ├── client.ts    # Client-side
│   │   ├── server.ts    # Server-side
│   │   └── middleware.ts
│   ├── utils.ts
│   └── types.ts
├── hooks/
└── stores/
```

---

## 🎨 Theme

**Dark Industrial Utilitarian**

- Background: `#0a0a0a` to `#1a1a1a`
- Accent: `#ef4444` (red)
- Fonts: Inter (sans), JetBrains Mono (mono)

---

## 📦 Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | ^15.1.6 | Framework |
| react | ^19.0.0 | UI Library |
| @supabase/ssr | ^0.5.2 | Auth & DB |
| framer-motion | ^11.15.0 | Animations |
| zustand | ^5.0.2 | State Management |
| @tanstack/react-query | ^5.62.7 | Server State |
| react-hook-form | ^7.54.2 | Forms |
| zod | ^3.24.1 | Validation |

---

## 🔐 Authentication

Uses Supabase Auth with middleware protection:

- `/login` - Public
- `/signup` - Public
- `/dashboard/*` - Protected (requires auth)

---

## 🚧 Next Steps

- [ ] Install dependencies (`npm install`)
- [ ] Add Supabase keys to `.env.local`
- [ ] Create auth pages (login/signup)
- [ ] Create dashboard layout
- [ ] Implement project CRUD
- [ ] Build timeline editor

---

**Created:** 10/10/2026  
**By:** Kiro AI Assistant
