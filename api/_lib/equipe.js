/* ==========================================================================
   api/_lib/equipe.js — sessão do PAINEL (proprietária e atendentes)
   --------------------------------------------------------------------------
   Totalmente separada da área da cliente: outra tabela (staff), outro
   cookie (pc_painel), outra validade. Reaproveita apenas as peças puras de
   sessao.js (gerar token, hash) e o bcrypt — nada do login da cliente muda.

   PAPÉIS:
     proprietaria  — tudo
     atendente     — atendimento, pedidos, estoque (consulta/ajuste), clientes
   ========================================================================== */

"use strict";

const bcrypt = require("bcryptjs");
const db = require("./db");
const S = require("./sessao");

const COOKIE = "pc_painel";
const HORAS = 12;

const PERMISSOES = {
  proprietaria: ["*"],
  atendente: ["dashboard", "atendimento", "pedidos", "estoque", "clientes", "produtos:ler", "entregas"],
};

function pode(staff, recurso) {
  const p = PERMISSOES[staff.role] || [];
  return p.indexOf("*") > -1 || p.indexOf(recurso) > -1;
}

function lerCookie(req) {
  const bruto = (req && req.headers && req.headers.cookie) || "";
  for (const pedaco of String(bruto).split(";")) {
    const i = pedaco.indexOf("=");
    if (i > 0 && pedaco.slice(0, i).trim() === COOKIE) return pedaco.slice(i + 1).trim() || null;
  }
  return null;
}

function cookie(token, expira) {
  const p = [COOKIE + "=" + token, "Path=/api/admin", "HttpOnly", "SameSite=Strict",
    "Max-Age=" + Math.max(0, Math.floor((expira.getTime() - Date.now()) / 1000))];
  if (S.emProducao()) p.push("Secure");
  return p.join("; ");
}
function cookieSaida() {
  const p = [COOKIE + "=", "Path=/api/admin", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (S.emProducao()) p.push("Secure");
  return p.join("; ");
}

function publico(s) {
  return s ? { id: s.id, nome: s.name, email: s.email, papel: s.role, ativo: s.active } : null;
}

async function entrar(email, senha) {
  const e = String(email || "").trim().toLowerCase();
  const linha = await db.um("SELECT * FROM staff WHERE email = $1", [e]);
  const ok = linha && linha.active ? await bcrypt.compare(String(senha || ""), linha.password_hash).catch(() => false)
                                   : (await bcrypt.compare("x", "$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTU").catch(() => false), false);
  if (!ok) return null;
  const token = S.gerarToken();
  const expira = new Date(Date.now() + HORAS * 3600 * 1000);
  await db.consulta("INSERT INTO staff_sessions (staff_id, token_hash, expires_at) VALUES ($1,$2,$3)", [linha.id, S.hashToken(token), expira]);
  if (Math.random() < 0.1) await db.consulta("DELETE FROM staff_sessions WHERE expires_at < now()").catch(() => {});
  return { staff: linha, cookie: cookie(token, expira) };
}

async function sair(req) {
  const t = lerCookie(req);
  if (t) await db.consulta("DELETE FROM staff_sessions WHERE token_hash = $1", [S.hashToken(t)]);
}

async function atual(req) {
  const t = lerCookie(req);
  if (!t) return null;
  const linha = await db.um(
    "SELECT s.*, ss.id AS sessao_id, ss.expires_at FROM staff_sessions ss JOIN staff s ON s.id = ss.staff_id WHERE ss.token_hash = $1",
    [S.hashToken(t)]);
  if (!linha || !linha.active) return null;
  if (new Date(linha.expires_at).getTime() <= Date.now()) {
    await db.consulta("DELETE FROM staff_sessions WHERE id = $1", [linha.sessao_id]);
    return null;
  }
  return linha;
}

async function hash(senha) { return bcrypt.hash(String(senha), 12); }

function senhaAceitavel(s) {
  const v = String(s || "");
  return v.length >= 10 && /[A-Za-z]/.test(v) && /\d/.test(v);
}

module.exports = { COOKIE, PERMISSOES, pode, entrar, sair, atual, publico, hash, senhaAceitavel, cookieSaida };
