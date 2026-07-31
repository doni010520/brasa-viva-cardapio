# Agente de impressão — Churrascaria Brasa Viva

Programa que fica rodando num computador do restaurante e imprime as comandas
automaticamente, sem ninguém precisar clicar.

## Por que ele existe

O sistema roda na internet; a impressora está na cozinha. Um não alcança o
outro. Este agente fica do lado de dentro: pergunta ao sistema se entrou pedido
novo e manda direto para a impressora.

Como a comanda é montada no servidor, mudar o layout do cupom **não exige**
atualizar este programa.

## O que você precisa

- Um computador (qualquer um, pode ser fraco) ligado na mesma rede da impressora
- [Node.js](https://nodejs.org) instalado (versão 20 ou mais nova)
- A impressora térmica instalada e funcionando no Windows

## Instalação

1. Copie a pasta `agente-impressao` para o computador do restaurante.
2. Dentro dela, copie o arquivo `.env.exemplo` para `.env`.
3. Abra o `.env` no Bloco de Notas e preencha:
   - `URL_SISTEMA` — o endereço do sistema
   - `TOKEN_IMPRESSAO` — a senha que está configurada no servidor
   - o bloco da sua impressora (Windows, rede ou arquivo)
4. Dê dois cliques em `iniciar.bat`.

Uma janela preta abre e fica escrito *"Deixe esta janela aberta"*. É isso: a
partir daí, todo pedido novo sai impresso sozinho.

## Duas impressoras: delivery numa, salão na outra

Cada comanda já chega com um destino, decidido pelo sistema:

| Via | Que pedidos | Exemplo de impressora |
|---|---|---|
| `viagem` | entrega e retirada | a térmica do balcão/expedição |
| `salao` | pedidos de mesa | a térmica da cozinha |

Com **uma impressora só**, não configure nada: as duas vias saem nela.

Com **duas no mesmo PC**, instale e compartilhe cada uma com um nome
(ex.: `I7PLUS` e `COZINHA`) e acrescente no `.env`:

```
IMPRESSORA_VIA_VIAGEM=I7PLUS
IMPRESSORA_VIA_SALAO=COZINHA
```

Via sem mapa cai na impressora padrão (`IMPRESSORA_NOME`) — comanda
nunca fica sem sair por falta de configuração.

## Testar sem impressora

No `.env`, use:

```
IMPRESSORA_TIPO=arquivo
PASTA_SAIDA=C:\comandas
```

Cada comanda vira um arquivo `.bin` naquela pasta. Serve para conferir se o
agente está conversando com o sistema antes de a impressora chegar.

## Deixar ligado sozinho quando o PC reiniciar

1. Aperte `Windows + R`, digite `shell:startup` e dê Enter.
2. Arraste o `iniciar.bat` para dentro dessa pasta (segure Alt para criar atalho).

Assim o agente sobe junto com o Windows.

## Quando algo não imprime

A janela do agente mostra o que aconteceu. Os dois casos comuns:

| O que aparece | O que fazer |
|---|---|
| `não consegui falar com o sistema` | A internet do restaurante caiu. O agente continua tentando sozinho; quando voltar, imprime as comandas atrasadas. |
| `a impressora não respondeu` | Impressora desligada, sem papel ou com o nome errado no `.env`. |

Nada se perde: a comanda fica na fila até imprimir. O dono também pode reimprimir
qualquer pedido pelo painel, em **Pedidos → Comanda**.
