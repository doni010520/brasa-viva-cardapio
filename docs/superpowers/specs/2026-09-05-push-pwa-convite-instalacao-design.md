# Push, PWA e o convite de instalação

Data: 2026-09-05

## O problema

Duas coisas separadas que se encontram no mesmo lugar.

A primeira: o aviso de "seu pedido está pronto" hoje só sai pelo WhatsApp, que
depende da uazapi conectada, do número certo e da mensagem não se perder no meio
de trinta conversas. O Web Push chega no aparelho pelo próprio navegador, de
graça, e aparece com a tela bloqueada. Isso já está construído no repositório —
service worker, tabela de inscrições, envio no servidor, botão na tela do
pedido — mas nunca foi commitado nem subiu para produção.

A segunda: o convite para instalar o cardápio na tela de início existe
(`DicaInstalar`), está no ar, e faz exatamente o que precisa — passo a passo no
iPhone, botão de instalar no Android. Só que ele aparece num único lugar,
`/meus-pedidos`, e apenas para quem já está logado **e** já tem pelo menos um
pedido. Quase ninguém chega lá.

As duas se encontram porque no iPhone o push **só funciona** com o site
instalado na tela de início. Instalar não é conveniência: é pré-requisito.

## O que sobe sem nenhuma linha nova

Já escrito e testado localmente, aguardando apenas commit e deploy:

- `public/sw.js` — service worker que recebe os avisos e serve a tela offline
- `public/offline.html` — o que aparece quando o sinal cai
- `src/app/manifest.ts` — manifesto com ícones, screenshots e atalhos
- `src/components/registrar-service-worker.tsx` — registro do SW no layout
- `src/lib/push.ts` + dependência `web-push`
- `supabase/migrations/0028_avisos_push.sql` — tabela `inscricoes_push`, RLS
  ligada e sem nenhuma política: só o servidor encosta
- `src/components/loja/avisar-quando-ficar-pronto.tsx` — o botão na tela do pedido
- disparo de `avisarStatusPorPush` dentro de `mudarStatusAction`
- header no `next.config.ts` que impede o `sw.js` de ficar preso em cache
- `appleWebApp` no `layout.tsx`

## O que muda

### O convite passa a aparecer em três lugares

`DicaInstalar` deixa de ser exclusivo de `/meus-pedidos` e passa a ser montado em:

1. **Topo da home do cardápio** — acima da lista, abaixo do cabeçalho
2. **Tela de acompanhamento do pedido** (`/pedido/[id]`)
3. **Tela de obrigado** (`/pedido/[id]/obrigado`)

Continua também em `/meus-pedidos`, mantendo a condição que já existe lá hoje:
só para quem está logado e já tem pelo menos um pedido. Nos três lugares novos
não há condição de sessão — o convite vale para visitante anônimo.

### Duas exceções, e o porquê de cada uma

**Não aparece no `EscolhaModo`.** Quando a pessoa ainda não escolheu se vai comer
no salão ou levar, a home mostra uma tela de pergunta única em vez do cardápio.
Convite de instalação ali compete com a única decisão que aquela tela existe para
colher.

**Não aparece no iPhone dentro da tela do pedido.** Ali o
`AvisarQuandoFicarPronto` já mostra o mesmo passo a passo de Compartilhar →
Adicionar à Tela de Início, e com um argumento mais forte: "o aviso só funciona
instalado". Duas instruções idênticas na mesma tela viram ruído. Naquela tela o
cartão fica só para Android.

### A dispensa passa a valer por visita

Hoje o componente grava em `localStorage` e some para sempre. Passa a gravar em
`sessionStorage`: quem fecha não vê mais pelo resto da navegação, mas volta a ver
na próxima visita.

Isso vale para os quatro lugares, inclusive o de `/meus-pedidos` que já existia —
ou seja, quem dispensou no passado volta a ver o convite. É consequência
esperada da mudança, não efeito colateral.

## Arquitetura

`DicaInstalar` continua sendo o único lugar que sabe **como** convidar: detectar
iPhone, guardar o `beforeinstallprompt` do Android, decidir entre passo a passo e
botão, e lembrar da dispensa. Quem chama só decide **se** e **onde**.

O componente ganha uma única entrada nova para cobrir a exceção do iPhone na tela
do pedido: `esconderNoIOS?: boolean`, falso por padrão, usado só em
`/pedido/[id]`. Nada além disso. Toda a lógica de detecção permanece dentro dele;
nenhuma página passa a saber o que é iPhone ou o que é `beforeinstallprompt`.

Fluxo de dados: nenhum. O convite não fala com o servidor, não grava no banco e
não depende de sessão. Vive inteiramente no navegador.

## Erros e casos de borda

- **Já instalado** — o componente sai do ar sozinho (`display-mode: standalone`
  ou `navigator.standalone`). Vale para os três lugares novos.
- **`beforeinstallprompt` nunca chega** — normal em Firefox, em desktop sem
  suporte e no próprio Chrome quando ele julga que o site não vale a instalação.
  O cartão simplesmente não nasce. Não há fallback: botão que não instala é pior
  que botão nenhum.
- **Falha no `prompt()`** — a dispensa acontece de qualquer forma; insistir com
  quem acabou de recusar no diálogo nativo é o pior momento possível.
- **Push falha** — já tratado: `avisarStatusPorPush` roda dentro de `try/catch`
  em `mudarStatusAction` e nunca desfaz a mudança de status. WhatsApp e push são
  independentes; um cair não afeta o outro.

## Risco assumido

No Android o cartão só nasce quando o Chrome dispara o `beforeinstallprompt`, e
não há como saber de antemão se ele virá. Com o cartão no topo da home, isso
empurra o cardápio para baixo no momento em que chega.

A entrada será animada para ler como intencional em vez de defeito, mas o
deslocamento existe e conta como layout shift. É o preço da posição no topo, e
foi escolhido conscientemente. No iPhone o problema não existe: a decisão é
tomada na primeira renderização.

## Deploy

A ordem importa.

1. Aplicar `0028_avisos_push.sql` no Supabase de produção — **antes do build**,
   senão o app sobe tentando gravar inscrição numa tabela que não existe
2. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` nos **Build Arguments e** no Environment
   (variável `NEXT_PUBLIC_` é gravada dentro do código durante o build; só no
   Environment o navegador não a enxerga)
3. `VAPID_PRIVATE_KEY` apenas no Environment
4. Commit e push
5. Disparar o webhook de deploy (GET)
6. `/api/saude` precisa responder `avisos_no_celular: true`

As chaves VAPID que já estão no `.env.local` são as que vão para produção.
Trocá-las depois derruba todos os avisos já ligados nos aparelhos dos clientes —
como ninguém se inscreveu em produção ainda, agora é o momento sem custo.

## Verificação

O projeto não tem suite automatizada; o que existe é `npm run lint` e os scripts
de screenshot com Playwright.

- `npm run lint` e `npm run build` limpos
- Screenshot das três telas novas com o cartão presente
- Screenshot do `EscolhaModo` provando que o cartão **não** está lá
- Em Android real: cartão aparece, botão instala, ícone vai para a tela
- Em iPhone real: passo a passo aparece na home e no obrigado, e **não**
  duplica na tela do pedido
- Ponta a ponta em aparelho instalado: pedido de teste, mudar status no admin,
  aviso chega com a tela bloqueada
