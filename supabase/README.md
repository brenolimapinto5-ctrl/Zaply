# Zaply — chamadas entre usuários

Esta pasta prepara o backend de chamadas. O arquivo HTML sozinho não consegue conectar chamadas entre celulares: é necessário um serviço de autenticação/sinalização e WebRTC.

## 1. Criar o projeto
1. Abra https://supabase.com/dashboard e crie um projeto.
2. Entre em **SQL Editor** → **New query**.
3. Abra `schema.sql` neste repositório, copie todo o conteúdo, cole no editor e clique em **Run**.

## 2. Ativar atualizações em tempo real
No Supabase, abra **Database → Publications** (ou a área de Realtime) e habilite as tabelas `calls` e `call_candidates` na publicação `supabase_realtime`.

## 3. Configurar autenticação
Em **Authentication → Providers**, habilite **Email**. Configure confirmação de e-mail conforme preferir. Cada pessoa que usar o Zaply precisará criar sua própria conta.

## 4. Conectar o aplicativo
O Zaply ainda precisa receber a URL do projeto Supabase e a chave pública **anon/publishable** para conectar login e sinalização. Nunca coloque a chave `service_role` no HTML ou em aplicativo público.

## 5. Chamadas reais
A implementação do cliente ainda precisa integrar:
- login Supabase (e-mail/senha) e perfil;
- criação/aceitação/encerramento de chamadas;
- troca de ofertas, respostas e ICE candidates via Realtime;
- WebRTC com STUN e, para conexões confiáveis em redes restritas, TURN.

**Importante:** criar estas tabelas não ativa chamadas por si só. Não anuncie chamadas como funcionando até testar entre dois celulares, em redes diferentes. Notificações de chamadas com o app fechado também exigem push notifications e configuração adicional.
