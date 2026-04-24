# Plano de Implementacao - Markdown Reviewer

## Visao do produto

O Markdown Reviewer sera um app desktop para revisar documentacao tecnica em Markdown dentro de Pull Requests do GitHub. O objetivo e oferecer uma experiencia mais proxima de Google Docs/Notion para comentarios, mas preservando o fluxo Git/GitHub e evitando que o reviewer precise ler Markdown como diff de codigo.

O app deve ser confortavel para pessoas de produto, engenharia, QA e stakeholders nao tecnicos. Por isso, a experiencia inicial deve priorizar selecionar um repositorio local, abrir um PR, navegar pelos arquivos Markdown alterados, ler o preview renderizado e comentar trechos especificos com pouco atrito.

## Principios de produto

- [ ] O preview Markdown deve ser a tela principal, nao o diff cru.
- [ ] Comentarios devem estar ancorados visualmente no trecho comentado.
- [ ] Comentarios locais devem funcionar sem depender de API do GitHub.
- [ ] O usuario deve conseguir revisar bastante conteudo sem a tela ficar poluida.
- [ ] Comentarios escondidos e resolvidos devem continuar rastreaveis por marcadores discretos.
- [ ] O submit para GitHub deve ser explicito, previsivel e seguro.
- [ ] O app deve ser simples o suficiente para usuarios nao tecnicos.

## Decisoes tecnicas fechadas

- [ ] Stack principal: Tauri v2, React, TypeScript, Bun, Tailwind e shadcn/ui.
- [ ] Produto como desktop app, usando frontend web dentro de WebView.
- [ ] Backend local via Tauri/Rust apenas para acesso ao sistema, Git, GitHub CLI e persistencia.
- [ ] Fluxo local-first para comentarios, com botao explicito de submit.
- [ ] Integracao com Git e GitHub via `git` e `gh` CLI sempre que possivel.
- [ ] Uso direto da API do GitHub apenas quando nao houver alternativa viavel, minimizando chamadas.
- [ ] MVP iniciando por repositorio local ja clonado e autenticado com `gh auth login`.
- [ ] SQLite local para drafts, cache de PR, estado de comentarios e preferencias de UI.
- [ ] Visual baseado nas telas finais do `design.pen`: `cZVML` e `markdownReviewExamples`.

## Arquitetura alvo

### Frontend

- [ ] React + TypeScript para UI.
- [ ] Tailwind + shadcn/ui para componentes.
- [ ] Estado de tela com store local simples, evitando complexidade prematura.
- [ ] Renderizacao Markdown com pipeline baseado em unified/remark/rehype.
- [ ] Renderizacao de codigo com Shiki.
- [ ] Mermaid renderizado no client com fallback de erro.

### Backend local Tauri

- [ ] Comandos Tauri pequenos e explicitamente allowlisted.
- [ ] Nenhum comando shell arbitrario exposto ao frontend.
- [ ] Toda chamada `git`/`gh` deve receber parametros estruturados.
- [ ] Respostas devem ser JSON tipado para o frontend.
- [ ] Logs locais devem ajudar debug sem vazar tokens ou conteudo sensivel.

### Persistencia local

- [ ] SQLite para repositorios recentes, PRs carregados, comentarios locais e cache.
- [ ] Comentarios locais devem sobreviver a restart do app.
- [ ] Cache de PR deve ter timestamp e poder ser atualizado manualmente.
- [ ] Estado de UI pode incluir arquivo selecionado, comentarios escondidos e filtros.

## Modelo mental de dados

### Entidades principais

- [ ] `Repository`: path local, remote URL, owner, repo, branch atual.
- [ ] `PullRequest`: numero, titulo, base branch, head branch, autor, status local de cache.
- [ ] `ChangedFile`: path, status, additions, deletions, oldSha, newSha, tipo de arquivo.
- [ ] `MarkdownDocument`: path, conteudo base, conteudo head, ranges alterados.
- [ ] `ReviewComment`: id local, PR, arquivo, anchor, corpo, status, visibilidade e id GitHub opcional.
- [ ] `CommentAnchor`: linha unica, range multilinha ou range dentro de bloco de codigo.

### Estados de comentario

- [ ] `draft`: comentario local ainda nao enviado.
- [ ] `submitted`: comentario publicado no GitHub.
- [ ] `hidden`: comentario oculto na visualizacao, mas ainda rastreavel por marker.
- [ ] `resolved`: comentario resolvido, colapsado por padrao.
- [ ] `deleted`: removido localmente ou pendente de remocao remota, se ja publicado.

## Comandos Tauri previstos

- [ ] `select_repository()`: abrir seletor de pasta e retornar path.
- [ ] `validate_repository(path)`: validar Git, remote GitHub e branch atual.
- [ ] `check_tools()`: validar `git`, `gh` e autenticacao.
- [ ] `list_pull_requests(repoPath)`: listar PRs relacionados ao repo local.
- [ ] `load_pull_request(repoPath, prNumber)`: carregar metadata, arquivos e refs.
- [ ] `list_changed_files(repoPath, prNumber)`: retornar arquivos alterados.
- [ ] `read_markdown_file(repoPath, ref, filePath)`: ler conteudo Markdown em uma ref.
- [ ] `load_file_diff(repoPath, prNumber, filePath)`: retornar ranges alterados e anchors validos.
- [ ] `create_local_comment(input)`: salvar comentario local.
- [ ] `update_local_comment(id, patch)`: editar comentario local.
- [ ] `delete_local_comment(id)`: apagar comentario local.
- [ ] `set_comment_visibility(id, hidden)`: esconder/exibir comentario.
- [ ] `resolve_comment(id)`: marcar como resolvido.
- [ ] `reopen_comment(id)`: reabrir comentario resolvido.
- [ ] `submit_review(repoPath, prNumber, commentIds)`: publicar lote de comentarios.
- [ ] `refresh_remote_comments(repoPath, prNumber)`: buscar comentarios existentes sob demanda.

## Fase 1: Setup Desktop e Integracao Local

Objetivo: criar a base do app e garantir que conseguimos selecionar um repositorio local e validar as ferramentas necessarias.

- [ ] Criar base do app com Tauri v2.
- [ ] Configurar frontend com React, TypeScript e Bun.
- [ ] Configurar Tailwind e shadcn/ui seguindo o layout do `design.pen`.
- [ ] Configurar scripts de desenvolvimento com Bun.
- [ ] Criar tela inicial para selecionar uma pasta local.
- [ ] Validar se a pasta selecionada e um repositorio Git.
- [ ] Validar se o repositorio possui remote GitHub.
- [ ] Validar dependencias locais: `git --version`, `gh --version` e `gh auth status`.
- [ ] Criar camada Tauri com comandos allowlist para chamadas locais.
- [ ] Criar SQLite local para cache, drafts e estado de UI.
- [ ] Exibir erros claros para Git ausente, GH CLI ausente, usuario nao autenticado, pasta invalida e PR nao encontrado.
- [ ] Salvar repositorios recentes localmente.

### Criterios de aceite da Fase 1

- [ ] Usuario abre o app desktop.
- [ ] Usuario seleciona uma pasta.
- [ ] App informa se a pasta esta pronta para review ou qual dependencia falta.
- [ ] App nao chama API GitHub diretamente nessa fase.

## Fase 2: Visualizacao Principal

Objetivo: permitir abrir um PR local e ler arquivos Markdown alterados com preview renderizado e busca.

- [ ] Implementar layout principal conforme a tela final `Markdown Reviewer - shadcn layout`.
- [ ] Criar rail lateral, sidebar de arquivos, toolbar, preview central e painel de threads.
- [ ] Listar PRs disponiveis no repositorio local usando `gh` e `git`.
- [ ] Carregar dados principais de um PR selecionado.
- [ ] Listar arquivos alterados do PR.
- [ ] Mostrar additions/deletions por arquivo.
- [ ] Implementar busca de arquivos alterados.
- [ ] Abrir arquivo Markdown selecionado.
- [ ] Renderizar preview Markdown da versao head.
- [ ] Destacar ranges alterados quando possivel.
- [ ] Exibir estados de loading, vazio e erro.

### Criterios de aceite da Fase 2

- [ ] Usuario seleciona repo e PR.
- [ ] App lista arquivos alterados.
- [ ] Busca filtra arquivos sem recarregar o PR.
- [ ] Clicar em um arquivo Markdown mostra preview legivel.
- [ ] Arquivos nao Markdown aparecem como nao suportados ou preview simplificado.

## Fase 3: Comentarios Base Local-First

Objetivo: criar o primeiro fluxo funcional de comentarios locais, sem publicar automaticamente no GitHub.

- [ ] Permitir criar comentario local em uma linha do Markdown.
- [ ] Permitir criar comentario local em range de varias linhas.
- [ ] Permitir criar comentario local dentro de bloco de codigo.
- [ ] Mostrar comentarios inline no documento.
- [ ] Mostrar comentarios no painel lateral de threads.
- [ ] Editar comentario local.
- [ ] Apagar comentario local.
- [ ] Persistir comentarios no SQLite local.
- [ ] Restaurar comentarios ao reabrir o app.
- [ ] Implementar botao `Submit review`.
- [ ] Publicar comentarios draft em lote no GitHub somente ao submeter.
- [ ] Manter comentarios locais em caso de erro de publicacao.
- [ ] Mostrar resultado do submit por comentario.

### Criterios de aceite da Fase 3

- [ ] Comentario criado aparece no documento e no painel lateral.
- [ ] Comentario editado atualiza imediatamente.
- [ ] Comentario apagado desaparece da UI e do SQLite.
- [ ] Submit envia comentarios draft e nao duplica comentarios ja enviados.
- [ ] Falha de submit nao perde rascunhos.

## Fase 4: Comentarios Avancados

Objetivo: refinar a experiencia para cenarios reais de review, incluindo muitos comentarios e selecoes complexas.

- [ ] Suportar multiplos comentarios na mesma linha.
- [ ] Exibir contador quando houver mais de um comentario no mesmo anchor.
- [ ] Implementar `Hide` por comentario.
- [ ] Implementar `Hide all`.
- [ ] Implementar `Show hidden`.
- [ ] Exibir marcador `message-square-off` para comentarios ocultos.
- [ ] Implementar `Resolve`.
- [ ] Implementar `Reopen`.
- [ ] Mostrar comentario resolvido colapsado por padrao.
- [ ] Exibir apenas icone discreto ao lado esquerdo da linha quando o comentario resolvido estiver fechado.
- [ ] Ao clicar no comentario resolvido, expandir thread e destacar temporariamente a linha ou range.
- [ ] Suportar ranges longos de 10 a 15 linhas ou mais.
- [ ] Suportar comentarios em blocos de codigo com o comentario aberto no meio.
- [ ] Agrupar painel lateral por arquivo, linha e range.

### Criterios de aceite da Fase 4

- [ ] Dois comentarios na mesma linha aparecem como contador e podem ser abertos.
- [ ] Range longo fica legivel e nao quebra layout.
- [ ] Comentario oculto continua rastreavel por marcador.
- [ ] Comentario resolvido nao polui o documento.
- [ ] Usuario consegue reabrir comentario resolvido.

## Fase 5: Preview Markdown Proximo ao GitHub

Objetivo: aproximar a renderizacao do GitHub para reduzir divergencia entre review local e PR real.

- [ ] Adicionar suporte completo a GFM com `remark-gfm`.
- [ ] Renderizar tabelas, listas, task lists, blockquotes e links.
- [ ] Implementar syntax highlight com Shiki.
- [ ] Renderizar Mermaid.
- [ ] Suportar anchors e links internos.
- [ ] Avaliar suporte a GitHub alerts.
- [ ] Sanitizar HTML com allowlist segura.
- [ ] Exibir fallback para Mermaid invalido.
- [ ] Exibir fallback para blocos de codigo muito grandes.
- [ ] Adicionar busca dentro do documento renderizado.
- [ ] Adicionar suporte visual para imagens relativas do repositorio.
- [ ] Tratar links para arquivos locais dentro do repo.

### Criterios de aceite da Fase 5

- [ ] Markdown comum renderiza parecido com GitHub.
- [ ] Blocos TypeScript tem highlight legivel.
- [ ] Mermaid valido renderiza diagrama.
- [ ] Mermaid invalido mostra erro localizado sem quebrar a pagina.
- [ ] HTML perigoso nao executa scripts.

## Fase 6: Sincronizacao com GitHub

Objetivo: conectar o review local com comentarios reais do PR, mantendo chamadas remotas controladas.

- [ ] Carregar comentarios existentes do PR sob demanda.
- [ ] Mapear comentarios do GitHub para anchors locais.
- [ ] Importar threads existentes para o painel lateral.
- [ ] Responder threads existentes.
- [ ] Editar comentarios publicados quando suportado.
- [ ] Apagar comentarios publicados quando suportado.
- [ ] Resolver e reabrir threads quando suportado pela integracao.
- [ ] Criar cache local por PR.
- [ ] Adicionar refresh manual.
- [ ] Evitar polling automatico no MVP.
- [ ] Invalidar cache ao trocar PR, branch ou executar refresh manual.
- [ ] Registrar quando uma thread remota nao puder ser mapeada com seguranca.

### Criterios de aceite da Fase 6

- [ ] Usuario pode importar comentarios existentes manualmente.
- [ ] Comentarios importados aparecem no documento quando o anchor e encontrado.
- [ ] Comentarios sem anchor seguro aparecem no painel lateral com aviso.
- [ ] Refresh manual atualiza estado sem polling.
- [ ] Chamadas remotas sao concentradas em submit e refresh manual.

## Fase 7: Repositorios e Clonagem

Objetivo: melhorar onboarding, permitindo encontrar e clonar repositorios pelo app em uma fase posterior.

- [ ] Criar tela futura para pesquisar repositorios do usuario.
- [ ] Listar repositorios via `gh repo list` ou alternativa equivalente.
- [ ] Permitir clonar repositorio pelo app.
- [ ] Permitir escolher pasta de destino para clone.
- [ ] Apos clone, seguir o mesmo fluxo de repositorio local.
- [ ] Permitir gerenciar historico de repositorios recentes.
- [ ] Manter essa fase fora do MVP inicial.

### Criterios de aceite da Fase 7

- [ ] Usuario encontra repositorios autenticados pelo GH CLI.
- [ ] Usuario clona um repo sem sair do app.
- [ ] Repo clonado entra no fluxo normal de selecao de PR.

## Testes e aceite geral

- [ ] Testar parser de diff e mapeamento de linhas.
- [ ] Testar mapeamento de ranges longos.
- [ ] Testar comentarios em bloco de codigo.
- [ ] Testar multiplos comentarios na mesma linha.
- [ ] Testar estados visible, hidden, resolved e submitted.
- [ ] Testar selecionar repositorio local.
- [ ] Testar abrir PR e buscar arquivo.
- [ ] Testar criar, editar, apagar, esconder, resolver e reabrir comentario.
- [ ] Testar submit review com sucesso.
- [ ] Testar submit review com erro parcial.
- [ ] Confirmar que o app funciona sem chamar API GitHub ate o momento do submit ou refresh manual.
- [ ] Testar reiniciar app e recuperar estado local.
- [ ] Testar PR com arquivo Markdown grande.
- [ ] Testar PR com Mermaid invalido.
- [ ] Testar repo sem `gh auth`.

## Riscos e cuidados

- [ ] Mapeamento de comentarios para linhas pode quebrar quando o arquivo muda entre cache e submit.
- [ ] GitHub pode exigir API especifica para certos tipos de review comment.
- [ ] Comentarios em Markdown renderizado precisam preservar correspondencia com linhas do arquivo fonte.
- [ ] Mermaid e HTML precisam de sandbox/sanitizacao.
- [ ] GH CLI pode estar autenticado com conta errada.
- [ ] Repositorios grandes podem exigir cache e carregamento incremental.
- [ ] Publicacao em lote precisa evitar duplicacao se o submit for repetido depois de erro parcial.

## Fora do MVP inicial

- [ ] Clonar repositorios pelo app.
- [ ] Pesquisa global de repositorios da organizacao.
- [ ] Suporte a providers alem de GitHub.
- [ ] Review offline sem repositorio local.
- [ ] Colaboracao em tempo real.
- [ ] Sincronizacao automatica em background.
