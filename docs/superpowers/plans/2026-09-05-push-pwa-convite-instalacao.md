# Push, PWA e convite de instalação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir para produção o push e o PWA que já estão construídos, e fazer o convite de instalação aparecer no topo da home, na tela de acompanhamento do pedido e na tela de obrigado.

**Architecture:** Quase nada é código novo. O grosso já está escrito e apenas não foi commitado. A parte nova é pequena e concentrada num único componente: `DicaInstalar` continua sendo o único lugar que sabe *como* convidar (detectar iPhone, guardar o evento do Android, lembrar da dispensa); as páginas só decidem *se* e *onde* montá-lo.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind, Supabase, `web-push`, Playwright (só para screenshots).

## Global Constraints

- Idioma de todo código, comentário, commit e texto de tela: **português do Brasil**.
- Comentário explica **por quê**, nunca o quê. Segue o tom que já existe no repositório.
- **Não existe suite de testes automatizados** neste projeto. A verificação é `npm run lint`, `npm run build`, screenshots via Playwright e teste em aparelho real. Não introduza framework de teste — não foi pedido e não é o assunto deste trabalho.
- `sessionStorage` e `localStorage` podem **lançar exceção** em modo privado/restrito. Todo acesso vai dentro de `try/catch`: este componente vive no topo da home, e uma exceção ali derruba a página inteira.
- A chave de dispensa é `cardapio:dica-instalar-dispensada` e não muda de nome.
- Nenhuma página pode passar a saber o que é iPhone ou o que é `beforeinstallprompt`. Essa lógica fica dentro de `DicaInstalar`.
- Commits: um por tarefa, mensagem no imperativo descrevendo o porquê.

---

### Task 1: Commitar o push e o PWA que já estão prontos

Todo o trabalho de push/PWA está escrito no diretório mas nunca foi commitado. Antes de mexer em qualquer coisa nova, ele precisa virar um commit limpo — assim o diff das mudanças do convite fica legível, e um problema de build aparece agora e não misturado com código novo.

**Files:**
- Commit (novos): `public/sw.js`, `public/offline.html`, `public/tela-celular.png`, `public/tela-computador.png`, `scripts/gerar-chaves-push.mjs`, `scripts/tirar-foto-instalacao.mjs`, `src/components/loja/avisar-quando-ficar-pronto.tsx`, `src/components/registrar-service-worker.tsx`, `src/lib/push.ts`, `supabase/migrations/0028_avisos_push.sql`
- Commit (modificados): `.env.example`, `DEPLOY.md`, `Dockerfile`, `README.md`, `next.config.ts`, `package.json`, `package-lock.json`, `src/app/(loja)/pedido/[id]/acoes.ts`, `src/app/(loja)/pedido/[id]/page.tsx`, `src/app/admin/(painel)/acoes.ts`, `src/app/api/saude/route.ts`, `src/app/layout.tsx`, `src/app/manifest.ts`

**Interfaces:**
- Consumes: nada
- Produces: `DicaInstalar` (já existente, assinatura sem props), `avisarStatusPorPush(pedido, novoStatus)` em `src/lib/push.ts`, componente `AvisarQuandoFicarPronto({ pedidoId })`

- [ ] **Step 1: Conferir que as dependências do push estão instaladas**

```bash
npm ls web-push @types/web-push
```

Esperado: as duas aparecem com versão. Se disser `(empty)` ou `UNMET`, rode `npm install` antes de seguir.

- [ ] **Step 2: Rodar o lint**

```bash
npm run lint
```

Esperado: sem erro. Se acusar algo dentro dos arquivos novos de push/PWA, **corrija antes de commitar** — não commite código que não passa no lint.

- [ ] **Step 3: Rodar o build**

```bash
npm run build
```

Esperado: build completo, sem erro de tipo. Este passo é o que prova que `src/lib/push.ts`, o `manifest.ts` e a mudança em `mudarStatusAction` compilam de verdade.

- [ ] **Step 4: Conferir que nada de segredo entrou junto**

```bash
git status --short
```

Esperado: `.env.local` **não** aparece na lista (está no `.gitignore`). Se aparecer, pare e avise — ele tem a chave privada VAPID e a service_role do Supabase.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js public/offline.html public/tela-celular.png public/tela-computador.png \
        scripts/gerar-chaves-push.mjs scripts/tirar-foto-instalacao.mjs \
        src/components/loja/avisar-quando-ficar-pronto.tsx \
        src/components/registrar-service-worker.tsx \
        src/lib/push.ts supabase/migrations/0028_avisos_push.sql \
        .env.example DEPLOY.md Dockerfile README.md next.config.ts \
        package.json package-lock.json \
        "src/app/(loja)/pedido/[id]/acoes.ts" "src/app/(loja)/pedido/[id]/page.tsx" \
        "src/app/admin/(painel)/acoes.ts" src/app/api/saude/route.ts \
        src/app/layout.tsx src/app/manifest.ts

git commit -m "Aviso de pedido pronto direto na tela do celular

O WhatsApp depende da uazapi conectada e do numero certo, e ainda se
perde no meio de trinta conversas. O push chega pelo proprio navegador,
de graca, e aparece com a tela bloqueada."
```

---

### Task 2: `DicaInstalar` — dispensa por visita, exceção do iPhone e entrada animada

Três mudanças no mesmo componente, todas pequenas. A dispensa deixa de ser eterna e passa a valer só pela visita. Ganha uma entrada para a página conseguir escondê-lo no iPhone. E passa a entrar animado, porque no Android ele nasce depois do carregamento e empurra o conteúdo.

**Files:**
- Modify: `src/components/loja/dica-instalar.tsx` (arquivo inteiro reescrito abaixo)
- Modify: `src/app/globals.css` (acrescentar a animação ao fim do arquivo)

**Interfaces:**
- Consumes: `Botao`, `Cartao` de `@/components/ui`
- Produces: `DicaInstalar({ esconderNoIOS }: { esconderNoIOS?: boolean })` — `esconderNoIOS` é `false` por padrão; quando `true`, o componente não renderiza nada em iPhone/iPad, e segue normal no Android.

- [ ] **Step 1: Acrescentar a animação ao `globals.css`**

Ao final de `src/app/globals.css`:

```css
/* O convite de instalar nasce depois do carregamento no Android — só quando o
   navegador avisa que dá para instalar. Entrar animado faz isso ler como
   intencional em vez de defeito. Quem pediu menos movimento no sistema não
   recebe nenhum. */
@keyframes surgir-dica {
  from {
    opacity: 0;
    transform: translateY(-0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dica-surgindo {
  animation: surgir-dica 240ms ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .dica-surgindo {
    animation: none;
  }
}
```

- [ ] **Step 2: Reescrever `src/components/loja/dica-instalar.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { Botao, Cartao } from '@/components/ui'

const CHAVE = 'cardapio:dica-instalar-dispensada'

type PromptDeInstalacao = Event & { prompt: () => Promise<void> }

/**
 * O navegador pode recusar storage (aba anônima, ajuste de privacidade) e aí
 * o acesso LANÇA em vez de devolver vazio. Este componente mora no topo da
 * home: uma exceção aqui levaria a página inteira junto, por causa de uma
 * dispensa que nem é informação importante.
 */
function dispensadaNestaVisita() {
  try {
    return Boolean(sessionStorage.getItem(CHAVE))
  } catch {
    return false
  }
}

function guardarDispensa() {
  try {
    sessionStorage.setItem(CHAVE, '1')
  } catch {
    // esqueceu na próxima página; melhor do que quebrar a tela
  }
}

/**
 * Convida a colocar o site na tela de início.
 *
 * Não é enfeite: no iPhone, o Safari joga fora cookie e storage de site que a
 * pessoa não abre há alguns dias — e junto vai a sessão. Instalado na tela de
 * início, o site ganha armazenamento próprio e o cliente continua logado. E é
 * também o único jeito de o aviso de "pedido pronto" chegar em iPhone.
 *
 * A dispensa vale pela visita, não para sempre: quem fechou hoje volta a ver
 * na próxima vez que entrar.
 *
 * `esconderNoIOS` existe para a tela de acompanhamento do pedido, onde o card
 * de avisos já ensina o mesmo passo a passo — e com argumento melhor.
 */
export function DicaInstalar({ esconderNoIOS = false }: { esconderNoIOS?: boolean }) {
  const [mostrar, setMostrar] = useState(false)
  const [ehIOS, setEhIOS] = useState(false)
  const [prompt, setPrompt] = useState<PromptDeInstalacao | null>(null)

  useEffect(() => {
    // já instalado? então não há o que sugerir
    const instalado =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    if (instalado || dispensadaNestaVisita()) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (ios && esconderNoIOS) return
    setEhIOS(ios)

    // No iPhone não existe botão de instalar: o caminho é o menu Compartilhar,
    // então a única saída é explicar. No Android o navegador avisa quando pode.
    if (ios) {
      setMostrar(true)
      return
    }

    function aoPoderInstalar(evento: Event) {
      evento.preventDefault()
      setPrompt(evento as PromptDeInstalacao)
      setMostrar(true)
    }

    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    return () => window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
  }, [esconderNoIOS])

  if (!mostrar) return null

  function dispensar() {
    guardarDispensa()
    setMostrar(false)
  }

  return (
    <Cartao className="dica-surgindo relative mt-6 p-4">
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="absolute top-3 right-3 text-tinta-300 hover:text-tinta-600"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="pr-6 font-bold text-tinta-900">Deixe na tela do celular</h2>
      <p className="mt-1 text-sm text-tinta-500">
        {ehIOS
          ? 'Assim vira um ícone como qualquer app — e você continua conectado, sem precisar entrar de novo.'
          : 'Vira um ícone como qualquer app, abre mais rápido e você continua conectado.'}
      </p>

      {ehIOS ? (
        <ol className="mt-3 space-y-1.5 text-sm text-tinta-600">
          <li className="flex items-center gap-2">
            <Share className="h-4 w-4 shrink-0 text-tinta-400" />
            Toque no botão Compartilhar, aqui embaixo
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus className="h-4 w-4 shrink-0 text-tinta-400" />
            Escolha &ldquo;Adicionar à Tela de Início&rdquo;
          </li>
        </ol>
      ) : (
        <Botao
          className="mt-3 h-11"
          onClick={async () => {
            await prompt?.prompt()
            dispensar()
          }}
        >
          Adicionar à tela de início
        </Botao>
      )}
    </Cartao>
  )
}
```

- [ ] **Step 3: Verificar que compila e passa no lint**

```bash
npm run lint && npm run build
```

Esperado: os dois limpos. `lista-meus-pedidos.tsx` chama `<DicaInstalar />` sem props — como `esconderNoIOS` tem padrão, ele continua compilando sem alteração.

- [ ] **Step 4: Conferir no navegador que a dispensa agora é por visita**

```bash
npm run dev
```

No Chrome, com DevTools aberto em modo celular:
1. Abrir `http://localhost:3000/meus-pedidos`, entrar e ter pelo menos um pedido
2. Em Application → Local Storage, apagar `cardapio:dica-instalar-dispensada` se existir
3. O cartão aparece; clicar no X
4. Recarregar a página → **continua sumido** (mesma visita)
5. Fechar a aba, abrir outra → **volta a aparecer**

Se no passo 4 ele reaparecer, a dispensa foi para `localStorage` ou não foi gravada.

- [ ] **Step 5: Commit**

```bash
git add src/components/loja/dica-instalar.tsx src/app/globals.css
git commit -m "Convite de instalar volta na proxima visita

Antes sumia para sempre no primeiro X. Quem dispensou sem ler nunca mais
via — e instalar e pre-requisito do aviso de pedido pronto no iPhone,
nao conveniencia."
```

---

### Task 3: Montar o convite nas três telas

**Files:**
- Modify: `src/app/(loja)/page.tsx` — entre `</section>` e `<Cardapio ... />`
- Modify: `src/app/(loja)/pedido/[id]/page.tsx` — logo após o bloco do `AvisarQuandoFicarPronto`
- Modify: `src/app/(loja)/pedido/[id]/obrigado/page.tsx` — antes do bloco de botões de navegação do fim

**Interfaces:**
- Consumes: `DicaInstalar({ esconderNoIOS })` da Task 2
- Produces: nada

- [ ] **Step 1: Home — importar e montar acima do cardápio**

Em `src/app/(loja)/page.tsx`, acrescentar ao topo, junto dos outros imports:

```tsx
import { DicaInstalar } from '@/components/loja/dica-instalar'
```

E no `return` final (o que renderiza `<Cardapio />`, **não** o do `EscolhaModo`), inserir entre o fechamento do `</section>` e o `<Cardapio ... />`:

```tsx
      </section>

      <DicaInstalar />

      <Cardapio categorias={categorias} lojaAberta={loja.aberta} />
```

Não toque no `return` do `EscolhaModo`: aquela tela existe para colher uma decisão só, e convite ali compete com a única pergunta que importa.

- [ ] **Step 2: Tela do pedido — montar só para Android**

Em `src/app/(loja)/pedido/[id]/page.tsx`, acrescentar aos imports:

```tsx
import { DicaInstalar } from '@/components/loja/dica-instalar'
```

E logo depois do bloco do `AvisarQuandoFicarPronto`:

```tsx
      {!cancelado && !finalizado && !aguardandoPagamento && (
        <AvisarQuandoFicarPronto pedidoId={pedido.id} />
      )}

      {/* No iPhone o card acima já ensina Compartilhar → Adicionar, e com
          argumento melhor: lá o aviso só funciona instalado. Aqui o convite
          fica só para Android, senão a mesma instrução sai duas vezes. */}
      {!cancelado && !finalizado && !aguardandoPagamento && <DicaInstalar esconderNoIOS />}
```

- [ ] **Step 3: Tela de obrigado — montar antes dos botões do rodapé**

Em `src/app/(loja)/pedido/[id]/obrigado/page.tsx`, acrescentar aos imports:

```tsx
import { DicaInstalar } from '@/components/loja/dica-instalar'
```

E inserir imediatamente antes do `<div className="mt-6 space-y-2">` que fecha a página:

```tsx
      <DicaInstalar />

      <div className="mt-6 space-y-2">
```

- [ ] **Step 4: Verificar que compila e passa no lint**

```bash
npm run lint && npm run build
```

Esperado: os dois limpos.

- [ ] **Step 5: Conferir as quatro telas no navegador**

Com `npm run dev` e o DevTools em modo celular (escolha um aparelho Android, ex.: Pixel 7):

| Tela | Esperado |
|---|---|
| `/` com escolha de modo pendente | **sem** cartão |
| `/` com o cardápio na tela | cartão entre o nome da loja e a lista |
| `/pedido/<id>` de pedido em andamento | cartão abaixo do "me avise quando ficar pronto" |
| `/pedido/<id>/obrigado` | cartão acima dos botões do rodapé |

Depois troque o aparelho emulado para um iPhone e recarregue `/pedido/<id>`: o passo a passo tem que aparecer **uma vez só**, dentro do card de avisos. Se aparecer duas vezes, o `esconderNoIOS` não chegou.

Observação: no Chrome desktop emulando celular, o `beforeinstallprompt` pode não disparar — nesse caso o cartão não nasce em modo Android, e isso é comportamento correto, não bug. A prova real é no aparelho, na Task 4.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(loja)/page.tsx" "src/app/(loja)/pedido/[id]/page.tsx" \
        "src/app/(loja)/pedido/[id]/obrigado/page.tsx"
git commit -m "Convite de instalar sai de Meus Pedidos para o caminho do cliente

So aparecia para quem ja estava logado e ja tinha pedido — ou seja,
quase ninguem. Agora nasce no topo do cardapio, no acompanhamento e no
obrigado."
```

---

### Task 4: Deploy

**PARE ANTES DE COMEÇAR ESTA TAREFA.** Ela mexe em produção: banco de um restaurante que está atendendo e um app que está no ar. Nenhum passo aqui roda sem o Adonis confirmar na hora. Não dispare o webhook por conta própria.

**Files:** nenhum arquivo do repositório

**Interfaces:**
- Consumes: os commits das Tasks 1–3
- Produces: app no ar com push funcionando

- [ ] **Step 1: Aplicar a migration no Supabase de produção**

`supabase/migrations/0028_avisos_push.sql` precisa entrar **antes** do build subir. Se o app subir primeiro, ele tenta gravar inscrição numa tabela que não existe.

Rodar o conteúdo do arquivo no SQL Editor do projeto `xlovjphnpqugtishcgow`. Conferir depois:

```sql
select count(*) from public.inscricoes_push;
```

Esperado: `0`, sem erro de tabela inexistente.

- [ ] **Step 2: Pôr as chaves VAPID no EasyPanel**

As chaves que já estão no `.env.local` são as que vão para produção. Trocá-las depois derruba todos os avisos já ligados nos aparelhos — como ninguém se inscreveu em produção ainda, agora é o momento sem custo.

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → **Build Arguments e** Environment (variável `NEXT_PUBLIC_` é gravada dentro do código durante o build; só no Environment o navegador não a enxerga)
- `VAPID_PRIVATE_KEY` → apenas Environment

Enquanto estiver na tela: o Bloco 1 ainda tem `NEXT_PUBLIC_URL_BASE=https://SEU-DOMINIO`. Corrigir para `https://brasavivadd.com`.

- [ ] **Step 3: Push dos commits**

```bash
git push origin main
```

- [ ] **Step 4: Disparar o deploy (só com confirmação na hora)**

O webhook é **GET** — POST devolve 415.

```bash
curl -sS "http://72.60.10.92:3000/api/deploy/<token>"
```

- [ ] **Step 5: Conferir que o push está de pé em produção**

```bash
curl -sS https://brasavivadd.com/api/saude
```

Esperado no JSON: `avisos_no_celular: true` **e** `avisos_no_celular_navegador: true`. Se a segunda vier `false`, a chave pública não entrou nos Build Arguments — corrigir e **rebuildar**, restart não resolve.

- [ ] **Step 6: Teste ponta a ponta em aparelho real**

Push não dá para testar de verdade sem aparelho. Em um Android e um iPhone:

1. Abrir `https://brasavivadd.com` — o cartão de instalar aparece
2. Android: tocar em "Adicionar à tela de início" e confirmar que o ícone vai para a tela
3. iPhone: seguir Compartilhar → Adicionar à Tela de Início
4. Abrir pelo ícone, fazer um pedido de teste
5. Na tela do pedido, ligar "me avise quando ficar pronto" e aceitar a permissão
6. No `/admin`, mudar o status do pedido
7. O aviso tem que chegar no aparelho — inclusive com a tela bloqueada

Se não chegar no iPhone: confirmar que ele foi aberto **pelo ícone instalado**, não pelo Safari. Fora do app instalado, iOS não entrega push.

- [ ] **Step 7: Refazer as fotos do convite de instalação**

As screenshots do manifesto foram tiradas antes do cartão existir. Com a loja **aberta** (fora do horário sai a tarja "Estamos fechados", e ela congela na foto):

```bash
node scripts/tirar-foto-instalacao.mjs
git add public/tela-celular.png public/tela-computador.png
git commit -m "Refaz as fotos do convite de instalacao"
git push origin main
```

---

## Auto-revisão

**Cobertura do spec:**

| Requisito do spec | Onde |
|---|---|
| Subir push/PWA já construído | Task 1 |
| Convite no topo da home | Task 3, Step 1 |
| Convite na tela do pedido | Task 3, Step 2 |
| Convite na tela de obrigado | Task 3, Step 3 |
| Não aparecer no `EscolhaModo` | Task 3, Step 1 (nota explícita) + Step 5 (tabela de verificação) |
| Não aparecer no iPhone na tela do pedido | Task 2 (`esconderNoIOS`) + Task 3, Step 2 |
| Dispensa por visita (`sessionStorage`) | Task 2, Steps 2 e 4 |
| `/meus-pedidos` mantém a condição atual | Nenhuma mudança no arquivo — verificado em Task 2, Step 3 |
| Entrada animada contra o pulo de layout | Task 2, Step 1 |
| Migration antes do build | Task 4, Step 1 |
| Chave pública nos Build Arguments | Task 4, Step 2 e Step 5 |
| Verificação em aparelho real | Task 4, Step 6 |

**Placeholders:** nenhum "TBD"/"TODO". O único valor não literal é o token do webhook na Task 4 Step 4, deliberadamente — é segredo e não entra em arquivo do repositório.

**Consistência de tipos:** `DicaInstalar` recebe `esconderNoIOS?: boolean` na Task 2 e é chamado como `<DicaInstalar />` (home, obrigado) e `<DicaInstalar esconderNoIOS />` (pedido) na Task 3. A chamada já existente em `lista-meus-pedidos.tsx` continua sem props e segue válida pelo valor padrão.
