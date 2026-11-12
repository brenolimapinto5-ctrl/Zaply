# Servidor Zaply

Servidor de sinalização para iniciar chamadas de áudio/vídeo entre usuários autenticados do Zaply.

## O que ele faz
- Endpoint HTTP `/health` para verificar se está online.
- WebSocket em `/ws`.
- Valida tokens JWT do Supabase usando a chave pública JWKS.
- Encaminha convite, aceite/recusa e mensagens de negociação WebRTC (offer, answer e ICE) somente entre participantes da chamada.
- Não transmite o áudio/vídeo pelo servidor: o navegador/app usa WebRTC peer-to-peer. Para conexões em redes difíceis, o app também precisará de um serviço TURN.

## Executar localmente
1. Instale Node.js 20 ou superior.
2. Entre na pasta `server` e execute `npm install`.
3. Defina `SUPABASE_URL` com a URL do projeto Supabase.
4. Opcional: defina `ALLOWED_ORIGINS` como uma lista separada por vírgulas de origens permitidas.
5. Execute `npm start`.

## Publicar no Render
1. Crie um Web Service usando este repositório.
2. O arquivo `render.yaml` configura a pasta `server` e o comando de inicialização.
3. Configure a variável `SUPABASE_URL` no painel do serviço.
4. Configure `ALLOWED_ORIGINS` com a origem HTTPS do app (ou deixe vazia temporariamente durante testes).
5. Após publicar, verifique `https://SEU-ENDERECO/health`. O WebSocket será `wss://SEU-ENDERECO/ws`.

## Eventos WebSocket
Primeira mensagem: `{"type":"auth","token":"SUPABASE_ACCESS_TOKEN"}`.

Depois da autenticação:
- Enviar: `{"type":"call:invite","to":"ID_DO_USUARIO","mode":"audio"}` (ou `video`).
- Receber: `call:incoming`, `call:ringing`, `call:unavailable`.
- Responder: `call:accept` ou `call:reject` com `callId`.
- Sinalização WebRTC: `webrtc:offer`, `webrtc:answer`, `webrtc:ice`, sempre com `callId` e `payload`.
- Encerrar: `call:end` com `callId`.

Este servidor é a base de sinalização; o cliente Zaply ainda precisa conectar esses eventos à interface de chamadas e à API WebRTC.
