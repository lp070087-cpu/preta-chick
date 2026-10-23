-- ==========================================================================
-- Preta Chik — loja: catálogo, estoque, pedidos, atendimento exclusivo,
-- pagamentos, frete, cupons e equipe do painel.
-- --------------------------------------------------------------------------
-- ADITIVA E REPRODUTÍVEL: só CREATE ... IF NOT EXISTS e INSERT ... ON CONFLICT
-- DO NOTHING. Não altera nem apaga nada das tabelas de autenticação
-- (customers, sessions, password_resets) criadas pela 001.
--
-- PREÇO: o material da loja não traz preço. Por isso price_cents nasce NULO
-- ("sob consulta"). Só a proprietária, pelo painel, define o valor real.
-- Sem preço, a peça não pode ser paga pelo site — segue pelo atendimento.
--
-- ESTOQUE: stock NULO = "não controlado ainda" (a loja confirma no
-- atendimento). Número = quantidade real cadastrada no painel.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------- EQUIPE
-- Contas do painel. Separadas de customers de propósito: a área da cliente
-- e o painel nunca compartilham sessão nem senha.
CREATE TABLE IF NOT EXISTS staff (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  email           text        NOT NULL UNIQUE,
  role            text        NOT NULL DEFAULT 'atendente'
                              CHECK (role IN ('proprietaria','atendente')),
  password_hash   text        NOT NULL,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid        NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_sessions_staff_idx ON staff_sessions (staff_id);

-- ------------------------------------------------------------- CATÁLOGO
CREATE TABLE IF NOT EXISTS categories (
  slug        text        PRIMARY KEY,
  name        text        NOT NULL,
  position    int         NOT NULL DEFAULT 0,
  is_showcase boolean     NOT NULL DEFAULT false,  -- vitrine (Novidades, Promoções)
  active      boolean     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
  id            text        PRIMARY KEY,           -- mesmo id do site (p01...)
  name          text        NOT NULL,
  category      text        NOT NULL REFERENCES categories (slug),
  categories    text[]      NOT NULL DEFAULT '{}',
  color_name    text,
  colors        text[]      NOT NULL DEFAULT '{}', -- hex das bolinhas do cartão
  badges        text[]      NOT NULL DEFAULT '{}',
  description   text,
  -- Fotos de produtos cadastrados pelo painel (URLs). As 16 peças originais
  -- usam assets/img/card/<id>-a/-b e deixam isto vazio.
  images        text[]      NOT NULL DEFAULT '{}',
  price_cents   int         CHECK (price_cents IS NULL OR price_cents >= 0),
  compare_cents int         CHECK (compare_cents IS NULL OR compare_cents >= 0),
  -- Dimensões e peso REAIS da embalagem. Nulos até a loja informar: sem eles
  -- o frete automático não é calculado (não inventamos medida).
  weight_g      int         CHECK (weight_g IS NULL OR weight_g > 0),
  height_cm     numeric(6,1),
  width_cm      numeric(6,1),
  length_cm     numeric(6,1),
  active        boolean     NOT NULL DEFAULT true,
  position      int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  text        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  size        text        NOT NULL,
  color       text        NOT NULL DEFAULT '',
  sku         text,
  stock       int         CHECK (stock IS NULL OR stock >= 0),
  reserved    int         NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  active      boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size, color)
);

-- Toda mudança de estoque deixa rastro. Nada de "UPDATE stock = x" sem motivo.
CREATE TABLE IF NOT EXISTS stock_movements (
  id          bigserial   PRIMARY KEY,
  variant_id  uuid        NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
  delta       int         NOT NULL,
  reason      text        NOT NULL,      -- ajuste, venda, cancelamento, devolucao
  ref_type    text,                      -- order | atendimento | manual
  ref_id      text,
  staff_id    uuid        REFERENCES staff (id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_variant_idx ON stock_movements (variant_id);

-- ------------------------------------------------------------- CUPONS
CREATE TABLE IF NOT EXISTS coupons (
  code          text        PRIMARY KEY,   -- sempre MAIÚSCULO
  kind          text        NOT NULL CHECK (kind IN ('percent','fixed','frete')),
  value         int         NOT NULL CHECK (value >= 0),  -- % ou centavos
  min_cents     int         NOT NULL DEFAULT 0,
  max_uses      int,
  uses          int         NOT NULL DEFAULT 0,
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------- ENDEREÇOS
CREATE TABLE IF NOT EXISTS customer_addresses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid        NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  label        text        NOT NULL DEFAULT 'Casa',
  recipient    text        NOT NULL,
  cep          text        NOT NULL,
  street       text        NOT NULL,
  number       text        NOT NULL,
  complement   text,
  district     text        NOT NULL,
  city         text        NOT NULL,
  uf           text        NOT NULL,
  is_default   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx ON customer_addresses (customer_id);

CREATE TABLE IF NOT EXISTS customer_favorites (
  customer_id  uuid        NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  product_id   text        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

-- Sacola persistente da cliente logada (espelho do localStorage).
CREATE TABLE IF NOT EXISTS customer_carts (
  customer_id  uuid        PRIMARY KEY REFERENCES customers (id) ON DELETE CASCADE,
  items        jsonb       NOT NULL DEFAULT '[]',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------- ATENDIMENTO EXCLUSIVO
-- Uma solicitação nasce quando a cliente escolhe "atendimento no WhatsApp".
-- Abrir o WhatsApp NÃO conclui nada: o status só anda pelo painel.
CREATE TABLE IF NOT EXISTS service_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL UNIQUE,          -- AT-XXXXXX
  customer_id     uuid        REFERENCES customers (id) ON DELETE SET NULL,
  name            text,
  phone           text,
  email           text,
  cep             text,
  status          text        NOT NULL DEFAULT 'aguardando_atendimento'
                  CHECK (status IN ('aguardando_atendimento','em_atendimento','aguardando_confirmacao',
                                    'aguardando_pagamento','pago','em_separacao','enviado','concluido','cancelado')),
  original_items  jsonb       NOT NULL,     -- carrinho exatamente como veio do site
  items           jsonb       NOT NULL,     -- carrinho em edição pela atendente
  subtotal_cents  int,
  discount_cents  int         NOT NULL DEFAULT 0,
  shipping_cents  int,
  shipping        jsonb,
  coupon_code     text,
  notes           text,                     -- observações internas da atendente
  customer_note   text,                     -- recado da cliente no pedido
  assigned_to     uuid        REFERENCES staff (id) ON DELETE SET NULL,
  sold_by         uuid        REFERENCES staff (id) ON DELETE SET NULL,
  order_id        uuid,
  idempotency_key text        UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_requests_status_idx ON service_requests (status);
CREATE INDEX IF NOT EXISTS service_requests_customer_idx ON service_requests (customer_id);

CREATE TABLE IF NOT EXISTS service_request_events (
  id          bigserial   PRIMARY KEY,
  request_id  uuid        NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
  kind        text        NOT NULL,     -- criado, status, itens, nota, frete, pagamento, pedido
  detail      jsonb,
  staff_id    uuid        REFERENCES staff (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_request_events_req_idx ON service_request_events (request_id);

-- ------------------------------------------------------------- PEDIDOS
CREATE TABLE IF NOT EXISTS orders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL UNIQUE,        -- PC-XXXXXX
  customer_id      uuid        REFERENCES customers (id) ON DELETE SET NULL,
  channel          text        NOT NULL CHECK (channel IN ('site','atendimento')),
  service_request_id uuid      REFERENCES service_requests (id) ON DELETE SET NULL,
  status           text        NOT NULL DEFAULT 'aguardando_pagamento'
                   CHECK (status IN ('aguardando_pagamento','pago','em_separacao','enviado','entregue',
                                     'concluido','cancelado','reembolsado')),
  payment_status   text        NOT NULL DEFAULT 'pendente'
                   CHECK (payment_status IN ('pendente','aprovado','recusado','estornado','cancelado')),
  payment_method   text,
  payment_provider text,
  payment_ref      text,
  payment_link     text,
  name             text        NOT NULL,
  phone            text        NOT NULL,
  email            text,
  address          jsonb,
  items            jsonb       NOT NULL,   -- foto do pedido: nome, cor, tamanho, preço no momento
  subtotal_cents   int         NOT NULL,
  discount_cents   int         NOT NULL DEFAULT 0,
  shipping_cents   int         NOT NULL DEFAULT 0,
  total_cents      int         NOT NULL,
  coupon_code      text,
  shipping         jsonb,                  -- serviço escolhido (Melhor Envio / retirada / local)
  shipping_label_id text,
  tracking_code    text,
  tracking_url     text,
  sold_by          uuid        REFERENCES staff (id) ON DELETE SET NULL,
  notes            text,
  stock_committed  boolean     NOT NULL DEFAULT false, -- evita baixar estoque duas vezes
  idempotency_key  text        UNIQUE,
  paid_at          timestamptz,
  shipped_at       timestamptz,
  canceled_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id          bigserial   PRIMARY KEY,
  order_id    uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  kind        text        NOT NULL,
  detail      jsonb,
  staff_id    uuid        REFERENCES staff (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id);

-- ------------------------------------------------------------- PAGAMENTOS
-- Uma linha por transação no provedor. (provider, provider_ref) é único:
-- a mesma notificação chegando duas vezes não cria duas transações.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        REFERENCES orders (id) ON DELETE SET NULL,
  provider      text        NOT NULL,     -- 'manual' ou o provedor configurado
  provider_ref  text        NOT NULL,
  method        text,                     -- pix, cartao, link, dinheiro
  status        text        NOT NULL,     -- pendente, aprovado, recusado, estornado
  amount_cents  int         NOT NULL,
  raw           jsonb,
  staff_id      uuid        REFERENCES staff (id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);
CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON payment_transactions (order_id);

-- Toda notificação recebida (pagamento ou frete) é registrada ANTES de ser
-- processada. event_id único = idempotência contra reenvio do provedor.
CREATE TABLE IF NOT EXISTS webhook_events (
  id            bigserial   PRIMARY KEY,
  provider      text        NOT NULL,
  event_id      text        NOT NULL,
  signature_ok  boolean     NOT NULL,
  payload       jsonb,
  processed_at  timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- ------------------------------------------------------------- AJUSTES
CREATE TABLE IF NOT EXISTS settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ==========================================================================
-- DADOS INICIAIS — espelho fiel de assets/js/dados.js. Sem preço, sem peso.
-- ON CONFLICT DO NOTHING: rodar de novo não sobrescreve o que a proprietária
-- já editou no painel.
-- ==========================================================================
INSERT INTO categories (slug, name, position, is_showcase) VALUES
  ('biquinis','Biquínis',1,false),
  ('conjuntos-praia','Conjuntos Praia',2,false),
  ('tops-praia','Tops de Praia',3,false),
  ('maios','Maiôs',4,false),
  ('saidas-praia','Saídas de Praia',5,false),
  ('novidades','Novidades',6,true),
  ('promocoes','Promoções',7,true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (id, name, category, categories, color_name, colors, badges, position) VALUES
  ('p01','Biquíni Preto com Amarração','tops-praia','{tops-praia,novidades}','Branco','{#f6f4f1,#ff65c3,#0f1116}','{Novo}',1),
  ('p02','Conjunto Praia Verde e Rosa','tops-praia','{tops-praia,novidades}','Branco','{#f6f4f1,#d9c9b8}','{Novo}',2),
  ('p03','Biquíni com Saída Laranja','biquinis','{biquinis,promocoes}','Rosa claro','{#f4cdd9,#0f1116,#e6e2dc}','{Novo}',3),
  ('p04','Conjunto Praia Preto com Transparência','biquinis','{biquinis,novidades}','Preto','{#141419,#7a3b2e}','{}',4),
  ('p05','Conjunto Crochê Marrom','conjuntos-praia','{conjuntos-praia,novidades}','Verde limão','{#d8e86a,#f6f4f1}','{Novo}',5),
  ('p06','Biquíni Rosa Vibrante','tops-praia','{tops-praia}','Caramelo','{#b57a4a,#0f1116}','{}',6),
  ('p07','Biquíni Branco com Saída','biquinis','{biquinis,promocoes}','Verde água','{#9fd8cf,#f6f4f1}','{}',7),
  ('p08','Conjunto Moda Praia','conjuntos-praia','{conjuntos-praia,novidades}','Laranja','{#ef8a4d,#f6f4f1}','{Novo}',8),
  ('p09','Biquíni Rosa com Detalhes','biquinis','{biquinis,novidades}','Sortido','{#f6f4f1,#f4cdd9,#141419}','{Novo}',9),
  ('p10','Biquíni Roxo de Amarrar','biquinis','{biquinis,promocoes}','Laranja','{#ef7a3c,#f6f4f1}','{}',10),
  ('p11','Biquíni Vermelho com Chapéu','biquinis','{biquinis}','Azul','{#8fb6d9,#f6f4f1}','{}',11),
  ('p12','Maiô Rosa com Saída Branca','tops-praia','{tops-praia,promocoes}','Branco','{#f6f4f1,#c9d3e0}','{}',12),
  ('p13','Saída de Praia Feminina','saidas-praia','{saidas-praia,novidades}','Branco','{#eeebe6,#f2b8cd}','{}',13),
  ('p14','Maiô Feminino','maios','{maios}','Jeans','{#7d97b5,#f2b8cd}','{}',14),
  ('p15','Conjunto Praia Feminino','conjuntos-praia','{conjuntos-praia}','Azul e branco','{#8fb6d9,#f6f4f1}','{}',15),
  ('p16','Biquíni Feminino','biquinis','{biquinis,promocoes}','Laranja','{#ef8a4d,#f0e59a}','{}',16)
ON CONFLICT (id) DO NOTHING;

-- Grade PP–GG por peça, cor = cor principal. stock NULO (não controlado),
-- exceto os tamanhos que o site já marcava como indisponíveis: stock 0.
INSERT INTO product_variants (product_id, size, color, stock)
SELECT p.id, t.size, COALESCE(p.color_name, ''),
       CASE WHEN (p.id = 'p04' AND t.size = 'PP')
              OR (p.id = 'p11' AND t.size = 'GG')
              OR (p.id = 'p16' AND t.size IN ('PP','G')) THEN 0 ELSE NULL END
FROM products p
CROSS JOIN (VALUES ('PP'),('P'),('M'),('G'),('GG')) AS t(size)
ON CONFLICT (product_id, size, color) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('loja', '{"nome":"Preta Chik Moda Praia","whatsapp":"5581984023286","instagram":"pretachik_modapraiaa"}'),
  ('frete', '{"cep_origem":null,"retirada_na_loja":true,"entrega_local":true}')
ON CONFLICT (key) DO NOTHING;
