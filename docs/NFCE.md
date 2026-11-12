# NFC-e: como ligar

Emissão própria (modelo 65, layout 4.00), sem provedor pago. A NFC-e da Bahia é
autorizada pela **SVRS** (nfce.svrs.rs.gov.br), não pelo host da SEFAZ-BA (lá dá
rejeição 702); QR Code e consulta pública são da SEFAZ-BA. Entrega a domicílio
(indPres 4) leva o destinatário com nome e endereço (rejeição 787 sem ele).
Código em `src/lib/nfce/`. Banco: migration `0029_nfce.sql`.

## O que precisa chegar

| Item | De onde vem | Onde entra |
|---|---|---|
| Certificado A1 (.pfx) + senha | contabilidade / dono | env `NFCE_CERT_PFX_BASE64`, `NFCE_CERT_SENHA` |
| CSC (id + código) | portal da SEFAZ-BA, gerado com o certificado | env `NFCE_CSC_ID`, `NFCE_CSC_TOKEN` |
| Inscrição estadual, razão social, endereço do CNPJ | contabilidade | Painel → Configurações → Nota fiscal |
| NCM / CFOP / CSOSN padrão e exceções (bebidas com ST) | contabilidade | mesma tela; exceção por produto no cardápio |

O CSC de homologação e o de produção são diferentes: gerar os dois.

## Passo a passo

1. Certificado em base64 (PowerShell):
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.pfx"))`
2. EasyPanel → app → Environment: colar as 4 variáveis acima e **salvar** antes do deploy
   (o deploy recria o container com o env salvo).
3. Conferir: `https://brasavivadd.com/api/saude?nfce=<TOKEN_IMPRESSAO>`
   deve mostrar o titular/validade do certificado e `sefaz.cStat = 107`.
4. Painel → Configurações → Nota fiscal: preencher dados, ambiente **Homologação**,
   marcar "Mostrar o botão Emitir NFC-e", salvar, "Testar conexão com a SEFAZ".
5. Emitir algumas notas de teste num pedido (sai "SEM VALOR FISCAL" no DANFE).
   Testar também cancelamento.
6. Trocar o CSC para o de produção, mudar o ambiente para **Produção**.

## Teste offline

`npx tsx scripts/teste-nfce.ts` — gera certificado de mentira, monta, assina e
confere a nota. Com `NFCE_XSD_DIR` apontando pros XSD do PL_010 e `xmllint`
no PATH, valida no schema oficial.

## Variáveis opcionais

- `NFCE_RESP_CNPJ`, `NFCE_RESP_CONTATO`, `NFCE_RESP_EMAIL`, `NFCE_RESP_FONE`: responsável técnico (infRespTec), se a SEFAZ-BA exigir.
- `NFCE_HOST_PRODUCAO`, `NFCE_HOST_HOMOLOGACAO`, `NFCE_URL_QRCODE_*`, `NFCE_URL_CHAVE_*`: troca de endereço sem mexer em código.
- `NFCE_CA_PEM`: arquivo com as ACs ICP-Brasil para validar o certificado do servidor da SEFAZ.

## Limites conhecidos

- Só Simples Nacional / MEI (CRT 1, 2, 4). Regime normal precisa dos grupos de ICMS com base.
- Sem contingência offline (tpEmis 9): se a SEFAZ cair, a nota fica "sem resposta" e é reenviada depois, conferindo a chave antes.
- Número pulado (nota que nunca saiu) precisa ser inutilizado na SEFAZ; rejeição reaproveita o número no mesmo pedido.
- NFS-e (serviço, prefeitura) não está aqui.
