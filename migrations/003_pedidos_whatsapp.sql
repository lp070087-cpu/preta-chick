-- ==========================================================================
-- Preta Chik — pedidos SOMENTE pelo WhatsApp
-- --------------------------------------------------------------------------
-- Regra comercial: a cliente monta o pedido no site, escolhe a entrega,
-- informa a PREFERÊNCIA de pagamento e envia pelo WhatsApp. A loja confirma
-- e conclui a venda. Nada é cobrado no site.
--
-- ADITIVA E REPRODUTÍVEL: nenhuma linha é apagada. As restrições de status
-- só são ALARGADAS (os valores antigos continuam válidos).
-- ==========================================================================

-- Solicitação: endereço informado pela cliente e preferência de pagamento.
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS address jsonb;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS payment_pref text;
-- Momento em que a cliente clicou em "Finalizar pedido pelo WhatsApp".
-- Abrir o WhatsApp NÃO prova que a mensagem foi enviada: isto registra só o
-- encaminhamento feito pelo site.
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS forwarded_at timestamptz;

ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('solicitacao_criada','aguardando_atendimento','em_atendimento','aguardando_confirmacao',
                    'aguardando_pagamento','pago','em_separacao','enviado','disponivel_retirada',
                    'concluido','cancelado'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('aguardando_pagamento','pago','em_separacao','enviado','disponivel_retirada',
                    'entregue','concluido','cancelado','reembolsado'));

-- Preferência de pagamento informada pela cliente (cópia no pedido gerado).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_pref text;

-- Data em que o pagamento foi efetivamente recebido (informada pela equipe).
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- Opções de pagamento mostradas no checkout — editáveis no painel.
-- São só PREFERÊNCIAS: nenhuma delas processa pagamento no site.
INSERT INTO settings (key, value) VALUES
  ('pagamento', '{"opcoes":["PIX","Cartão de crédito","Cartão de débito","Dinheiro na retirada"]}')
ON CONFLICT (key) DO NOTHING;
