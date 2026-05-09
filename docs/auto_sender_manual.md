# Manual do Utilizador — Auto Sender (xBot)

> Modulo `auto_sender` — versao 2.0  
> Parte do **xBot Chrome Extension** para TribalWars PT/BR

---

## Indice

1. [O que e o Auto Sender](#1-o-que-e-o-auto-sender)
2. [Como ativar](#2-como-ativar)
3. [Como funciona a fila](#3-como-funciona-a-fila)
4. [Adicionar ataques a fila](#4-adicionar-ataques-a-fila)
   - [Via Planeador](#4a-via-planeador)
   - [Via Kumin Gluer](#4b-via-kumin-gluer)
5. [Painel Auto Sender](#5-painel-auto-sender)
6. [Como o motor funciona](#6-como-o-motor-funciona)
7. [Integracao com o Kumin Gluer](#7-integracao-com-o-kumin-gluer)
8. [Integracao com o Planeador](#8-integracao-com-o-planeador)
9. [Limitacoes conhecidas e dicas](#9-limitacoes-conhecidas-e-dicas)

---

## 1. O que e o Auto Sender

O Auto Sender e um modulo do xBot que envia ataques automaticamente num horario de millisegundo preciso. Em vez de teres de clicar "Atacar" exatamente no segundo certo, defines antecipadamente o ataque, e o modulo:

1. Monitoriza a fila permanentemente enquanto o browser esta aberto em qualquer pagina do jogo.
2. 40 segundos antes da hora de saida programada, abre automaticamente uma nova aba no ecra do quartel (Praca de Reuniao).
3. Preenche o alvo e as unidades nessa aba.
4. Espera pelo instante exacto com precisao de sub-millisegundo (busy-wait) e clica em "Atacar".
5. Na pagina de confirmacao, clica em "Confirmar" automaticamente e fecha a aba.

O Auto Sender nao depende do Kumin autosender externo. E completamente interno ao xBot e usa o `localStorage` do browser para manter a fila entre abas e recarregamentos de pagina.

---

## 2. Como ativar

1. Clica no icone do xBot na barra do Chrome (canto superior direito do browser).
2. Nas definicoes do xBot, ativa o modulo **Auto Sender**.
3. Clica em Guardar / fechar.
4. Recarrega qualquer pagina do jogo (`game.php`). O modulo fica ativo em todas as abas do jogo.

> O modulo corre em segundo plano em **todas as paginas** do jogo, nao apenas numa pagina especifica. Nao precisas de ficar na pagina do quartel — qualquer aba aberta no jogo serve de "vigia".

---

## 3. Como funciona a fila

### Chave de armazenamento

A fila e guardada em `localStorage` sob a chave:

```
xbot_autosender_queue
```

E um array JSON. Podes inspeccionar o seu conteudo abrindo as DevTools do Chrome (`F12`) e escrevendo na consola:

```js
JSON.parse(localStorage.getItem('xbot_autosender_queue'))
```

### Formato de uma entrada

Cada entrada na fila tem a seguinte estrutura:

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | string | Identificador unico gerado automaticamente (`as_<timestamp>_<random>`) |
| `src` | string | Coordenadas de origem no formato `"500\|500"` |
| `tgt` | string | Coordenadas de destino no formato `"502\|498"` |
| `srcVillageId` | string | ID interno da aldeia de origem (necessario para abrir o quartel correto) |
| `tgtVillageId` | string ou null | ID interno da aldeia alvo (opcional; se presente, e passado no URL do quartel para pre-selecionar o alvo) |
| `launch` | number | Hora de saida em epoch milliseconds (hora do servidor) |
| `arrival` | number | Hora de chegada prevista em epoch milliseconds |
| `units` | object | Unidades a enviar, ex: `{ "axe": 500, "light": 200 }` |
| `note` | string | Nota livre (nome da aldeia de origem, label do plano, etc.) |
| `status` | string | Estado actual: `pending`, `launching`, `place_open`, `place_filled`, `submitted`, `sent`, `failed` |
| `createdAt` | number | Timestamp de quando a entrada foi criada |

### Ciclo de vida de uma entrada

```
pending
  -> launching    (watcher abre a aba do quartel, 40 s antes)
  -> place_open   (aba do quartel aberta, a ler o comando)
  -> place_filled (unidades e alvo preenchidos)
  -> submitted    (botao "Atacar" clicado)
  -> sent         (botao "Confirmar" clicado — envio concluido)
  -> failed       (algo correu mal ou a hora de saida ja passou)
```

---

## 4. Adicionar ataques a fila

Ha dois caminhos para adicionar ataques ao Auto Sender:

### 4a. Via Planeador

O Planeador e a ferramenta de calculo de coordenadas e horarios integrada no xBot. Depois de calcular um ataque:

1. Abre o Planeador clicando no botao **🗺️** que aparece ao lado do icone de quests na barra do jogo.
2. Preenche o campo **Alvo** com as coordenadas do inimigo (ex: `502|498`).
3. Preenche **Data** e **Hora** com a hora de chegada desejada (formato `DD/MM/AAAA` e `HH:MM:SS.mmm`).
4. Seleciona o **Grupo** de aldeias a usar e o tipo de comando (Ataque ou Apoio).
5. Clica em **CALCULAR**.

O Planeador mostra uma tabela com todas as tuas aldeias que ainda conseguem chegar a tempo, ordenadas por hora de saida (mais cedo primeiro). Para cada linha ve:

- Nome e coordenadas da aldeia de origem
- Unidades disponiveis (colunas com icones; clica num icone de unidade no cabecalho para activar/desactivar aquela unidade no calculo)
- **Hora de Saida** calculada
- **Contagem decrescente** ate a hora de saida
- Tres botoes de accao: **Enviar**, **+ Kumin**, **+ Autosend**

Para agendar um ataque no Auto Sender, clica em **+ Autosend** na linha da aldeia que queres usar. O botao muda para **✓ Queued** durante 2 segundos para confirmar. O ataque e adicionado imediatamente a fila `xbot_autosender_queue`.

> **Nota:** Se o modulo Auto Sender nao estiver ativo, o botao mostra um `alert` a informar que precisas de activar o modulo primeiro.

#### Editar quantidade de tropas

Antes de clicar **+ Autosend**, podes ajustar a quantidade de unidades de cada aldeia clicando directamente nas celulas verdes da tabela. Aparece um campo de texto onde podes digitar a quantidade exacta. Carrega **Enter** para confirmar ou **Escape** para cancelar.

### 4b. Via Kumin Gluer

O Kumin Gluer e o painel de "cola" — serve para planear ataques de defesa ou sincronizados contra ataques inimigos incoming. O fluxo e ligeiramente diferente:

1. Vai a uma pagina de aldeia inimiga (`screen=info_village`).
2. Na secao de ataques incoming, clica na linha do ataque que queres cobrir. A linha fica destacada a azul.
3. Abre o painel **Kumin Gluer** no overlay do xBot (icone colatudo na barra lateral).
4. No painel, ajusta as configuracoes:
   - **Jogo**: velocidade do servidor (ex: `1.4` para PT1)
   - **Tropa**: multiplicador de velocidade das unidades (ex: `0.75`)
   - **Sigilia %**: percentagem de sigilia activa (reduz o tempo de viagem)
   - **Tipo**: Ataque ou Apoio
5. Clica em **Carregar tropas**. O sistema vai buscar os teus exercitos a todas as tuas aldeias.
6. Aparecem os **Candidatos** — aldeias que conseguem chegar a tempo. Para cada candidato:
   - Selecciona as unidades pretendidas (clica no icone para preencher com o maximo disponivel, ou escreve o numero exacto no campo)
   - Clica em **+ Queue** para adicionar aquele candidato a fila interna do Gluer
7. Depois de adicionar todos os candidatos pretendidos, vai ao rodape do painel:
   - **🚀 Autosend** — transfere toda a fila do Gluer para o Auto Sender (escreve directamente em `xbot_autosender_queue`) e limpa a fila do Gluer.
   - **📜 Kumin** — envia para o Kumin autosender externo (caminho alternativo, ver secao 7).
   - **📋 Copiar BB** — copia as strings de BB Code para a area de transferencia (para colar manualmente no Kumin).

> Clica em **🚀 Autosend** no rodape do Kumin Gluer para enviar todos os candidatos agendados para o Auto Sender de uma so vez.

---

## 5. Painel Auto Sender

Abre o painel clicando em **🚀 Auto Sender** no overlay do xBot (ou navega ate ele pelo menu principal do overlay).

### Cabecalho

- **Titulo**: "Auto Sender"
- **Subtitulo**: mostra o numero de ataques pendentes (ex: `3 pendentes`) e, se pausado, `· pausado`
- **Ponto verde animado** (pip): aparece quando ha um ataque activo a ser processado (estado `launching` ou posterior)

### Corpo — lista da fila

Quando ha ataques na fila, cada entrada mostra:

| Elemento | Descricao |
|---|---|
| `src → tgt` | Coordenadas de origem e destino |
| Nota | Se existir, aparece em cinzento ao lado das coordenadas (truncada se longa) |
| Hora de saida | Data e hora humanizada: `"hoje as 14:23:07.450"` ou `"amanha as 08:00:00.000"` |
| Badge de contagem | Mostra o tempo restante em `HH:MM:SS.mmm`. Muda de cor conforme a urgencia: verde (mais de 1 hora), laranja (10-60 minutos), vermelho (menos de 10 minutos). Se o estado for `enviado` aparece em cinzento; se for `falhou` em vermelho. Se a hora ja passou aparece `atrasado!`. |
| Icones de unidades | Icones das unidades com a quantidade respectiva |
| Botao ✕ | Remove aquela entrada da fila |

Quando a fila esta vazia, aparece uma mensagem com instrucoes para adicionar ataques via Planeador ou Kumin Gluer.

### Rodape — controlos

| Botao | Funcao |
|---|---|
| **⏸ Pausar** | Suspende o watcher. Nenhum ataque e lancado enquanto pausado. O botao muda para **▶ Retomar**. |
| **▶ Retomar** | Reactiva o watcher. Os ataques pendentes voltam a ser monitorizados. |
| **🗑 Limpar fila** | Remove todos os ataques da fila (pede confirmacao). Desactivado quando a fila esta vazia. |

> **Pausa:** a pausa e guardada em `sessionStorage` (por aba). Se fechares e reabrires o browser, o watcher retoma automaticamente.

---

## 6. Como o motor funciona

Esta secao descreve o que acontece "por baixo" para quem queira entender o mecanismo de precisao.

### SharedWorker — timer resistente a background tabs

O browser limita a frequencia dos `setInterval` em abas em segundo plano (background throttling). Para contornar isso, o Auto Sender usa um **SharedWorker** — um worker partilhado por todas as abas abertas no mesmo dominio. O worker corre num thread separado e nao esta sujeito ao throttling. O watcher recebe um "tick" a cada segundo independentemente de a aba estar visivel ou nao.

Se o browser nao suportar SharedWorker (raro), o modulo cai de volta para `setInterval` normal com um aviso na consola.

### Fase de vigilancia (Watcher)

A cada segundo, o watcher:

1. Verifica se ha um ataque em curso (`xbot_autosender_active` no localStorage). Se sim, espera.
2. Verifica se esta pausado (`xbot_autosender_paused` no sessionStorage). Se sim, espera.
3. Percorre a fila e procura a primeira entrada `pending` cuja hora de saida seja daqui a 40 segundos ou menos.
4. Se encontrar, marca-a como `launching` e escreve os dados do ataque em `xbot_autosender_active` (como mutex para evitar que outras abas roubem o mesmo ataque).
5. Abre uma nova aba: `game.php?village=<srcVillageId>&screen=place[&target=<tgtVillageId>]`
6. Para depois de processar um ataque por ciclo (um de cada vez).

Se a hora de saida ja passou ha mais de 10 segundos, a entrada e marcada como `failed` automaticamente.

### Aba do quartel (Place handler)

Quando a nova aba abre no quartel (`screen=place`):

1. Le `xbot_autosender_active` do localStorage e apaga-o imediatamente (evita que outra aba o processe).
2. Verifica se o `game_data.village.id` da pagina corresponde ao `srcVillageId` do comando. Se nao corresponder, marca como `failed` e mostra erro.
3. Preenche o campo de coordenadas do alvo usando `nativeSet` — uma tecnica que bypassa o sistema de eventos sinteticos do React e garante que o jogo reconhece o valor como se o utilizador o tivesse escrito.
4. Preenche os campos de unidades da mesma forma.
5. Mostra uma contagem decrescente no ecra (canto inferior esquerdo, sobreposicao azul).

### Precisao de sub-millisegundo (busy-wait)

Quando a hora de saida se aproxima, o modulo usa uma tecnica de tres fases:

1. **Fase grossa** (`coarseWait`): `setTimeout` para despertar 1800 ms antes da hora alvo.
2. **Fase fina** (`rafLoop`): `requestAnimationFrame` para actualizacoes a cada frame (~16 ms).
3. **Busy-wait**: quando faltam 50 ms ou menos, um loop `while(performance.now() < deadline)` ocupa o CPU sem ceder controlo ao browser, garantindo que o clique nao e atrasado por nenhum evento do browser.

Este mecanismo consegue precisoes tipicas de 1-5 ms relativamente a hora do servidor.

### Pagina de confirmacao (Confirm handler)

Apos o clique em "Atacar", o jogo redireciona para `screen=place&try=confirm`. O modulo:

1. Le o ID do comando de `sessionStorage` (`xbot_autosender_confirming`).
2. Aguarda 300 ms para o DOM carregar.
3. Procura o botao de confirmacao (`#troop_confirm_submit`, `.troop_confirm_go`, ou qualquer `input[type=submit]` com texto "confirmar"/"confirm").
4. Clica no botao, marca o ataque como `sent`, e fecha a aba apos 1,8 segundos.

### Sincronizacao com o tempo do servidor

Em vez de usar `Date.now()` (hora local do cliente), o modulo usa `window.Timing.getCurrentServerTime()` do jogo, que ja compensa a diferenca entre o relogio do servidor e o do cliente. Isto elimina erros causados por o teu computador estar adiantado ou atrasado.

---

## 7. Integracao com o Kumin Gluer

O Kumin Gluer e o Kumin autosender externo sao dois sistemas distintos. O xBot permite usar ambos em paralelo para o mesmo conjunto de ataques:

| Botao no Gluer | Destino | Quando usar |
|---|---|---|
| **📜 Kumin** | Kumin autosender externo (abre `screen=memo`) | Se queres que o Kumin processe os envios (requer Kumin instalado e activo) |
| **🚀 Autosend** | Auto Sender do xBot (`xbot_autosender_queue`) | Envio nativo do xBot, sem dependencias externas |
| **📋 Copiar BB** | Area de transferencia (BB Code) | Para colagem manual no Kumin ou partilha com outros jogadores |

Podes usar os dois sistemas para ataques diferentes ao mesmo tempo — por exemplo, envia via Kumin o ataque principal e via Auto Sender os de apoio. A fila do Kumin Gluer (`twKuminGluer_queue`) e a fila do Auto Sender (`xbot_autosender_queue`) sao independentes.

### O botao "🚀 Autosend" no Gluer em detalhe

Quando clicas **🚀 Autosend** no rodape do Kumin Gluer:

1. Le a fila interna do Gluer (guardada apenas em memoria React durante a sessao).
2. Converte cada entrada no formato da fila do Auto Sender (campos `src`, `tgt`, `srcVillageId`, `launch`, `arrival`, `units`, `note`, `status: "pending"`).
3. Acrescenta as novas entradas ao array existente em `xbot_autosender_queue` no localStorage.
4. Dispara o evento `xbot:autosender:run` com `action: "getState"` para actualizar imediatamente o painel do Auto Sender.
5. Limpa a fila interna do Gluer.

---

## 8. Integracao com o Planeador

O Planeador tem dois modos de interaccao com o sistema Kumin/Auto Sender:

### Adicionar ao Auto Sender (+ Autosend)

O botao **+ Autosend** em cada linha da tabela do Planeador chama directamente `window.xbot_addToQueue(entry)` — a funcao publica exposta pelo modulo `auto_sender.user.js`. A entrada e adicionada imediatamente a fila sem abrir nenhuma aba adicional.

### Adicionar ao Kumin (+ Kumin)

O botao **+ Kumin** escreve a entrada no `twKuminGluer_queue` e abre `screen=memo` numa nova aba. Quando a aba de memo abre, um dos dois modulos (Planeador ou Kumin Gluer) processa a fila e preenche o formulario do Kumin automaticamente.

### Coordenacao entre Planeador e Kumin Gluer no screen=memo (crash fix)

Quando o ecra de memo e aberto, tanto o `planeador.user.js` como o `kumin_gluer.user.js` correm em simultâneo. Para evitar que os dois tentemos preencher o formulario ao mesmo tempo (o que causaria erros e comandos duplicados), existe um mecanismo de mutex:

1. O primeiro modulo a chegar ao `initMemo` reclama a fila com a flag `window.__kuminQueueClaimed = true` e apaga a fila do localStorage imediatamente (operacao atomica no contexto single-thread do JS).
2. O segundo modulo, ao ver `__kuminQueueClaimed`, aguarda o evento `xbot:kumin:queue:done` (ou a flag `window.__xbotQueueDone`) antes de iniciar a sua propria logica de cache.
3. Quando o processador da fila termina todos os comandos, dispara `window.dispatchEvent(new Event('xbot:kumin:queue:done'))` para sinalizar ao outro modulo que pode continuar.
4. O modulo que estava a aguardar inicia entao o `cacheKuminCommands()` com 800 ms de atraso de seguranca.

Isto garante que o formulario do Kumin e preenchido em sequencia correcta, sem conflitos.

---

## 9. Limitacoes conhecidas e dicas

### Limitacoes

**O browser tem de estar aberto.** O Auto Sender e um userscript que corre no browser — se o browser estiver fechado, nenhum ataque sera enviado. Mantém pelo menos uma aba do jogo aberta no computador durante o periodo em que tens ataques agendados.

**Uma aba activa por ataque.** O motor processa um ataque de cada vez. Se tiveres dois ataques com hora de saida identica (ou a diferenca de segundos), o segundo tera um ligeiro atraso porque o primeiro ainda esta a ser processado. Idealmente, nao agendas dois ataques exactamente ao mesmo segundo.

**Aldeia errada.** Se o teu browser nao tiver sessao activa na aldeia de origem (por exemplo, mudaste de conta), a aba do quartel que abre pode pertencer a uma aldeia diferente. O modulo detecta isso e marca o ataque como `failed`.

**Sem suporte a Noble Train (NT).** A versao actual do Auto Sender nao preenche os campos de Noble Train na pagina de confirmacao. Se precisas de NT, usa o Kumin autosender para esses ataques.

**Throttling em abas de fundo.** Embora o SharedWorker mitigue o throttling, em alguns browsers ou configuracoes agressivas de economia de energia o timer pode atrasar ligeiramente. Para maior fiabilidade, deixa uma aba do jogo visivel durante os 5 minutos anteriores a cada ataque critico.

**Relogio do cliente desincronizado.** O modulo usa `window.Timing.getCurrentServerTime()` do jogo para todas as comparacoes de tempo. No entanto, se por algum motivo essa funcao nao estiver disponivel (ex: pagina a carregar), cai de volta para `Date.now()`. Certifica-te de que o relogio do teu sistema esta razoavelmente sincronizado.

### Dicas praticas

- **Verifica a fila antes de te ausentar.** Abre o painel Auto Sender e confirma que todos os ataques que querias agendar aparecem com o estado `pending` e o badge de contagem correcto.

- **Usa a nota para identificar ataques.** Ao adicionar via Planeador, o campo `note` e preenchido com o nome da aldeia de origem. No Gluer, e preenchido com `"Glue HH:MM:SS"`. Podes identificar rapidamente cada linha no painel.

- **Corrige a hora no Planeador antes de clicar + Autosend.** Se fizeste o calculo e depois te apercebes que a hora de chegada esta errada, altera os campos Data/Hora e clica **CALCULAR** de novo antes de clicar **+ Autosend**. O botao usa sempre os dados calculados naquele momento.

- **Remove ataques indesejados com o ✕.** Se mudares de ideias sobre um ataque ja agendado, abre o painel e clica no **✕** ao lado da entrada. A remocao e imediata.

- **Pausa se precisas de intervencao manual.** Se precisas de enviar um ataque manualmente ou de abrir o quartel de uma aldeia sem interferencia do Auto Sender, usa **⏸ Pausar** no painel. Lembra-te de **▶ Retomar** depois.

- **Os ataques com `failed` podem ser reenviados manualmente.** Entradas com estado `failed` ficam visiveis no painel (badge vermelho). Remove-as e, se ainda ha tempo, volta a adicionar via Planeador ou Gluer.

- **O painel actualiza-se automaticamente.** Nao precisas de recarregar nem de sair e entrar no painel — ele actualiza o estado a cada meio segundo via evento `xbot:autosender:state` disparado pelo userscript.

---

*Manual gerado para xBot Auto Sender v2.0.0*
