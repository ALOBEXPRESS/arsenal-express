# Teste do Menu de Exportação

## ✅ Correções Aplicadas

### Problema Identificado
O menu dropdown estava usando um placeholder básico que apenas renderizava `<div>` em vez de um dropdown funcional.

### Solução Implementada
1. **Instalação do Radix UI Dropdown Menu** (`@radix-ui/react-dropdown-menu@2.1.25`)
2. **Implementação completa** em `components/ui/dropdown-menu.tsx`:
   - Portal para renderização fora do contexto (evita z-index issues)
   - Animações de entrada/saída
   - Posicionamento correto com `align="end"`
   - Acessibilidade completa (keyboard navigation, ARIA)
   - Styling consistente com o design system

### Componentes do Menu
```
Exportar (button)
├─ Exportar CapCut → abre CapCutExportSheet
├─ Exportar Áudio → placeholder (console.log)
├─ (separator)
└─ Renderizar e Exportar → abre RenderSheet
```

## Como Testar no Vercel

1. Aguarde o deploy terminar
2. Abra um projeto
3. Clique no botão **"Exportar"** (no header, ao lado de "Montagem")
4. Verifique se o dropdown abre corretamente
5. Teste cada opção:
   - **Exportar CapCut**: deve abrir a modal de exportação (funcional)
   - **Exportar Áudio**: console log (não implementado ainda)
   - **Renderizar e Exportar**: deve abrir a modal de renderização

## Status das Funcionalidades

### Exportar CapCut ✅
- Totalmente funcional
- Conector local opcional
- .zip como fallback
- Animações e transições aplicadas

### Exportar Áudio 🚧
- Menu item criado
- Ainda sem implementação
- TODO: mixar narração + clips → .mp3

### Renderizar e Exportar ⚠️
- UI criada (presets, progress bar)
- Lógica de renderização implementada
- **NÃO TESTADO** com vídeos reais ainda
- Usa mediabunny + WebCodecs

## Commits

- `3bfd81b`: fix(web): Blob constructor type cast for mediabunny Uint8Array output
- `7bbbcb7`: feat(web): trim/cut support, export menu (CapCut/Audio/MP4), MP4 render (mediabunny)
- `[novo]`: fix(web): proper radix-ui dropdown menu implementation

## Próximos Passos

1. **Testar renderização MP4** com projeto real
2. **Implementar ferramenta de corte** na UI (marcar in/out points)
3. **Implementar exportação de áudio** (.mp3 mixado)
4. **Adicionar overlays** na renderização (texto/imagens)
5. **Transições** entre cenas no MP4 renderizado
