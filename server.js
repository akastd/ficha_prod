import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  KANBAN_STATUS_VALUES,
  clienteUpdateBodySchema,
  clientesQuerySchema,
  cloudinaryDeleteParamsSchema,
  cloudinaryDeleteQuerySchema,
  cloudinarySignatureBodySchema,
  fichaBodySchema,
  fichaQuerySchema,
  kanbanOrderBodySchema,
  kanbanStatusBodySchema,
  parseWithZod,
  positiveIdParamSchema,
  relatorioClienteDetalheQuerySchema,
  relatorioClientesListQuerySchema,
  relatorioPeriodoQuerySchema
} from './src/validators/serverSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURAÇÃO CLOUDINARY ====================
const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'SEU_CLOUD_NAME',
  apiKey: process.env.CLOUDINARY_API_KEY || 'SUA_API_KEY',
  apiSecret: process.env.CLOUDINARY_API_SECRET || 'SEU_API_SECRET',
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'fichas_upload'
};

// Função para gerar assinatura do Cloudinary
function generateCloudinarySignature(paramsToSign) {
  const sortedParams = Object.keys(paramsToSign)
    .sort()
    .map(key => `${key}=${paramsToSign[key]}`)
    .join('&');

  const stringToSign = sortedParams + CLOUDINARY_CONFIG.apiSecret;
  return crypto.createHash('sha1').update(stringToSign).digest('hex');
}

const NAME_EXCEPTIONS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const UPPERCASE_WORD_PATTERN = /^[A-ZÀ-Ý]{1,4}$/;
const AUTO_OBS_MARKERS = Object.freeze([
  'TECIDO',
  'MANGA',
  'PERSONALIZADO EM',
  'SEM PERSONALIZACAO',
  'COM NOMES',
  'SOMENTE NUMEROS',
  'PEITILHO',
  'PE DE GOLA',
  'FILETE',
  'FAIXA REFLETIVA',
  'ABERTURA LATERAL',
  'REFORCO',
  'BOLSO'
]);

function normalizeNameCase(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const originalWords = text.split(' ');
  const preserveUppercaseIndexes = new Set();
  if (originalWords.length > 1) {
    if (UPPERCASE_WORD_PATTERN.test(originalWords[0])) preserveUppercaseIndexes.add(0);
    const lastIndex = originalWords.length - 1;
    if (UPPERCASE_WORD_PATTERN.test(originalWords[lastIndex])) preserveUppercaseIndexes.add(lastIndex);
  }

  return text
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (preserveUppercaseIndexes.has(index)) return word.toUpperCase();
      return word
        .split(/([-/])/)
        .map(part => {
          if (!part || part === '-' || part === '/') return part;
          if (index > 0 && NAME_EXCEPTIONS.has(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('');
    })
    .join(' ');
}

function normalizeProdutos(produtos) {
  if (!Array.isArray(produtos)) return [];

  return produtos.map(produto => {
    if (!produto || typeof produto !== 'object') return produto;
    const produtoPrincipal = normalizeNameCase(produto.produto || produto.descricao || '');
    const detalhesProduto = normalizeNameCase(produto.detalhesProduto || produto.detalhes || '');
    return {
      ...produto,
      produto: produtoPrincipal,
      descricao: produtoPrincipal,
      detalhesProduto
    };
  });
}

function normalizeComNomesValue(value) {
  if (value === true) return 1;
  if (value === false || value === null || value === undefined) return 0;

  const numero = Number.parseInt(String(value).trim(), 10);
  if (Number.isInteger(numero) && numero >= 1 && numero <= 3) return numero;

  const texto = String(value).trim();
  if (!texto) return 0;
  if (/somente n[úu]meros/i.test(texto)) return 3;
  if (/com nomes e n[úu]meros/i.test(texto)) return 2;
  if (/com nomes/i.test(texto) || /^true$/i.test(texto)) return 1;

  return 0;
}

function normalizeFichaPayload(dados) {
  const comNomesRaw = dados?.comNomes ?? dados?.com_nomes;
  return {
    ...dados,
    cliente: normalizeNameCase(dados?.cliente || ''),
    vendedor: normalizeNameCase(dados?.vendedor || ''),
    corPeDeGolaInterno: normalizeNameCase(dados?.corPeDeGolaInterno || ''),
    corPeDeGolaExterno: normalizeNameCase(dados?.corPeDeGolaExterno || ''),
    corBotao: normalizeNameCase(dados?.corBotao || ''),
    produtos: normalizeProdutos(dados?.produtos),
    comNomes: normalizeComNomesValue(comNomesRaw)
  };
}

function normalizarTextoBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function textoSemHtml(valor) {
  const texto = String(valor || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return texto
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function observacaoPareceAutoDescricao(valor) {
  const normalizado = normalizarTextoBusca(valor).toUpperCase();
  if (!normalizado) return false;
  const hits = AUTO_OBS_MARKERS.reduce((total, marker) => (
    normalizado.includes(marker) ? total + 1 : total
  ), 0);
  const temSeparador = normalizado.includes(' / ');
  return (temSeparador && hits >= 1) || hits >= 3;
}

function extrairObservacoesUsuario(valor) {
  const texto = textoSemHtml(valor);
  if (!texto) return '';
  if (!observacaoPareceAutoDescricao(texto)) return texto;

  const linhas = texto
    .split(/\r?\n+/)
    .map(linha => linha.trim())
    .filter(Boolean);

  const linhasMarcadas = linhas.filter(linha => (
    /(^|\s)(obs|observacoes?|anotacoes?|nota)\s*[:\-]/i.test(linha)
  ));
  if (linhasMarcadas.length > 0) {
    return linhasMarcadas.join(' ');
  }

  if (linhas.length > 1) {
    return linhas.slice(1).join(' ').trim();
  }

  return '';
}

function extrairTextoProdutosBusca(produtosRaw) {
  if (!produtosRaw) return '';
  let produtos = produtosRaw;
  if (typeof produtosRaw === 'string') {
    try {
      produtos = JSON.parse(produtosRaw);
    } catch (_) {
      return '';
    }
  }
  if (!Array.isArray(produtos)) return '';
  return produtos.map(item => (
    [
      item?.produto,
      item?.descricao,
      item?.detalhesProduto,
      item?.detalhes,
      item?.tamanho
    ]
      .filter(Boolean)
      .join(' ')
  )).join(' ');
}

function extractFirstImageSrcFromArray(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  for (const item of items) {
    if (typeof item === 'string') {
      const value = item.trim();
      if (value) return value;
      continue;
    }

    if (item && typeof item === 'object') {
      const value = String(item.src || item.url || '').trim();
      if (value) return value;
    }
  }

  return '';
}

function extractFichaThumbSrc(ficha) {
  const raw = ficha?.imagens_data;
  const parsedImages = (() => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  })();

  const fromImages = extractFirstImageSrcFromArray(parsedImages);
  if (fromImages) return fromImages;

  const single = String(ficha?.imagem_data || '').trim();
  return single || '';
}

function summarizeFicha(ficha) {
  return {
    id: ficha.id,
    cliente: ficha.cliente,
    vendedor: ficha.vendedor,
    data_inicio: ficha.data_inicio,
    numero_venda: ficha.numero_venda,
    data_entrega: ficha.data_entrega,
    status: ficha.status,
    evento: ficha.evento,
    arte: ficha.arte,
    produtos: ficha.produtos,
    material: ficha.material,
    kanban_status: ficha.kanban_status,
    kanban_ordem: ficha.kanban_ordem,
    thumbSrc: extractFichaThumbSrc(ficha)
  };
}

function fichaCorrespondeTermoBusca(ficha, termo) {
  const termoNormalizado = normalizarTextoBusca(termo);
  if (!termoNormalizado) return true;

  const camposBusca = [
    ficha?.cliente,
    ficha?.vendedor,
    ficha?.numero_venda,
    extrairTextoProdutosBusca(ficha?.produtos),
    extrairObservacoesUsuario(ficha?.observacoes)
  ];

  return camposBusca.some(campo => normalizarTextoBusca(campo).includes(termoNormalizado));
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

function setShortCdnCache(res, seconds = 30) {
  const safeSeconds = Math.max(1, Number(seconds) || 30);
  const staleSeconds = Math.max(safeSeconds * 4, safeSeconds + 30);
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${safeSeconds}, stale-while-revalidate=${staleSeconds}`);
}


// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // Evita servir HTML antigo, que pode carregar bundle incompatível.
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// ==================== CONEXÃO TURSO ====================
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error('Configuração ausente: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente.');
}

function createDbClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

let db = createDbClient();

// Inicializar banco de dados
async function initDatabase() {
  try {
    // Criar tabela de fichas
    await executeDb(`
      CREATE TABLE IF NOT EXISTS fichas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        vendedor TEXT,
        data_inicio DATE,
        numero_venda TEXT,
        data_entrega DATE,
        evento TEXT DEFAULT 'nao',
        status TEXT DEFAULT 'pendente',
        kanban_status TEXT DEFAULT 'pendente',
        kanban_status_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        kanban_ordem INTEGER,
        material TEXT,
        composicao TEXT,
        cor_material TEXT,
        manga TEXT,
        acabamento_manga TEXT,
        largura_manga TEXT,
        cor_acabamento_manga TEXT,
        gola TEXT,
        cor_gola TEXT,
        acabamento_gola TEXT,
        largura_gola TEXT,
        cor_peitilho_interno TEXT,
        cor_peitilho_externo TEXT,
        cor_pe_de_gola_interno TEXT,
        cor_pe_de_gola_externo TEXT,
        cor_botao TEXT,
        abertura_lateral TEXT,
        cor_abertura_lateral TEXT,
        reforco_gola TEXT,
        cor_reforco TEXT,
        bolso TEXT,
        filete TEXT,
        filete_local TEXT,
        filete_cor TEXT,
        faixa TEXT,
        faixa_local TEXT,
        faixa_cor TEXT,
        arte TEXT,
        com_nomes INTEGER DEFAULT 0,
        observacoes TEXT,
        imagem_data TEXT,
        imagens_data TEXT,
        produtos TEXT,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_entregue DATETIME,
        auto_entregue_em DATETIME
      )
    `);

    // Criar tabela de clientes
    await executeDb(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT UNIQUE NOT NULL,
        primeiro_pedido DATE,
        ultimo_pedido DATE,
        total_pedidos INTEGER DEFAULT 0,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeDb(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        action TEXT NOT NULL,
        ficha_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeDb(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        route TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        status_code INTEGER,
        response_body TEXT,
        resource_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (route, idempotency_key)
      )
    `);

    // Criar índices
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_cliente ON fichas(cliente)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_status ON fichas(status)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_data_inicio ON fichas(data_inicio)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_data_entrega ON fichas(data_entrega)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_vendedor ON fichas(vendedor)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_system_logs_ficha_id ON system_logs(ficha_id)`);
    await executeDb(`CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at DESC)`);

    // ==================== MIGRAÇÕES ====================
    const migrações = [
      'imagens_data TEXT',
      'cor_acabamento_manga TEXT',
      'cor_gola TEXT',
      'largura_gola TEXT',
      'cor_pe_de_gola_interno TEXT',
      'cor_pe_de_gola_externo TEXT',
      'cor_botao TEXT',
      'cor_abertura_lateral TEXT',
      'filete_local TEXT',
      'filete_cor TEXT',
      'faixa_local TEXT',
      'faixa_cor TEXT',
      'com_nomes INTEGER DEFAULT 0',
      "kanban_status TEXT DEFAULT 'pendente'",
      'kanban_status_updated_at DATETIME',
      'kanban_ordem INTEGER',
      'auto_entregue_em DATETIME'
    ];

    for (const coluna of migrações) {
      try {
        await executeDb(`ALTER TABLE fichas ADD COLUMN ${coluna}`);
        console.log(`[db:migration] Coluna ${coluna.split(' ')[0]} adicionada`);
      } catch (e) {
        // Coluna já existe, ignorar
      }
    }

    try {
      await executeDb(`
        UPDATE fichas
        SET com_nomes = CASE
          WHEN observacoes IS NOT NULL AND (UPPER(observacoes) LIKE '%SOMENTE NÚMEROS%' OR UPPER(observacoes) LIKE '%SOMENTE NUMEROS%') THEN 3
          WHEN observacoes IS NOT NULL AND (UPPER(observacoes) LIKE '%COM NOMES E NÚMEROS%' OR UPPER(observacoes) LIKE '%COM NOMES E NUMEROS%') THEN 2
          WHEN observacoes IS NOT NULL AND UPPER(observacoes) LIKE '%COM NOMES%' THEN 1
          ELSE 0
        END
        WHERE com_nomes IS NULL
      `);
    } catch (e) {
      // Ignora se a coluna não existir por qualquer motivo.
    }

    try {
      await executeDb(`
        UPDATE fichas
        SET kanban_status = 'pendente'
        WHERE kanban_status IS NULL OR trim(kanban_status) = ''
      `);
      await executeDb(`
        UPDATE fichas
        SET kanban_status_updated_at = COALESCE(kanban_status_updated_at, data_atualizacao, data_criacao, CURRENT_TIMESTAMP)
        WHERE kanban_status_updated_at IS NULL OR trim(kanban_status_updated_at) = ''
      `);
      await preencherKanbanOrdemInicial();
      await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_kanban_status ON fichas(kanban_status)`);
      await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_kanban_status_updated_at ON fichas(kanban_status_updated_at)`);
      await executeDb(`CREATE INDEX IF NOT EXISTS idx_fichas_kanban_ordem ON fichas(kanban_status, kanban_ordem)`);
    } catch (e) {
      // Ignora se a coluna ainda não existir por qualquer motivo.
    }

    console.log('[db] Banco de dados Turso inicializado com sucesso');
  } catch (error) {
    console.error('[db] Erro ao inicializar banco de dados:', error);
    throw error;
  }
}

// ==================== FUNÇÕES AUXILIARES ====================

async function dbAll(sql, params = []) {
  const result = await executeDb({ sql, args: params });
  return result.rows;
}

async function dbGet(sql, params = []) {
  const result = await executeDb({ sql, args: params });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function dbRun(sql, params = []) {
  const safeParams = Array.isArray(params)
    ? params.map(value => (value === undefined ? null : value))
    : params;
  const result = await executeDb({ sql, args: safeParams });
  return {
    lastInsertRowid: result.lastInsertRowid,
    rowsAffected: result.rowsAffected
  };
}

const IDEMPOTENCY_ROUTE_CREATE_FICHA = 'POST:/api/fichas';
const IDEMPOTENCY_STATUS_PROCESSING = 'processing';
const IDEMPOTENCY_STATUS_COMPLETED = 'completed';

function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length > 128) return '';
  if (!/^[a-zA-Z0-9:_-]+$/.test(normalized)) return '';
  return normalized;
}

function isUniqueConstraintError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('unique constraint') || message.includes('constraint failed');
}

function parseStoredIdempotentResponse(rawValue, fallbackId = null) {
  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_) {
      // ignore parse error and use fallback payload
    }
  }

  return {
    id: fallbackId,
    message: 'Ficha criada com sucesso'
  };
}

async function getIdempotencyRecord(route, idempotencyKey) {
  return dbGet(
    `
      SELECT route, idempotency_key, status, status_code, response_body, resource_id
      FROM idempotency_keys
      WHERE route = ? AND idempotency_key = ?
      LIMIT 1
    `,
    [route, idempotencyKey]
  );
}

async function reserveIdempotencyKey(route, idempotencyKey) {
  const now = new Date().toISOString();
  await dbRun(
    `
      INSERT INTO idempotency_keys (route, idempotency_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [route, idempotencyKey, IDEMPOTENCY_STATUS_PROCESSING, now, now]
  );
}

async function completeIdempotencyKey(route, idempotencyKey, statusCode, responseBody, resourceId = null) {
  const now = new Date().toISOString();
  await dbRun(
    `
      UPDATE idempotency_keys
      SET
        status = ?,
        status_code = ?,
        response_body = ?,
        resource_id = ?,
        updated_at = ?
      WHERE route = ? AND idempotency_key = ?
    `,
    [
      IDEMPOTENCY_STATUS_COMPLETED,
      Number(statusCode) || 201,
      JSON.stringify(responseBody || {}),
      resourceId,
      now,
      route,
      idempotencyKey
    ]
  );
}

async function releaseIdempotencyReservation(route, idempotencyKey) {
  await dbRun(
    'DELETE FROM idempotency_keys WHERE route = ? AND idempotency_key = ? AND status = ?',
    [route, idempotencyKey, IDEMPOTENCY_STATUS_PROCESSING]
  );
}

function isDbConnectionNotOpenedError(error) {
  const message = String(error?.message || '').toLowerCase();
  const causeMessage = String(error?.cause?.message || '').toLowerCase();
  return message.includes('connection not opened') || causeMessage.includes('connection not opened');
}

async function recreateDbClient() {
  const previousDb = db;
  db = createDbClient();
  if (previousDb && typeof previousDb.close === 'function') {
    try {
      await previousDb.close();
    } catch (_) {
      // ignore
    }
  }
}

async function executeDb(statement, attempt = 1) {
  try {
    return await db.execute(statement);
  } catch (error) {
    const canRetry = attempt < 2 && isDbConnectionNotOpenedError(error);
    if (!canRetry) throw error;

    console.warn('[db] Conexão não aberta detectada. Recriando cliente Turso e tentando novamente...');
    await recreateDbClient();
    return executeDb(statement, attempt + 1);
  }
}

async function getNextKanbanOrder(status, excludeId = null) {
  const params = [status];
  let query = 'SELECT COALESCE(MAX(kanban_ordem), 0) + 1 AS next_order FROM fichas WHERE kanban_status = ?';

  if (excludeId !== null && excludeId !== undefined) {
    query += ' AND id != ?';
    params.push(Number(excludeId));
  }

  const row = await dbGet(query, params);
  const parsed = Number(row?.next_order);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

async function preencherKanbanOrdemInicial() {
  await executeDb(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY kanban_status
          ORDER BY
            replace(replace(COALESCE(kanban_status_updated_at, data_atualizacao, data_criacao, CURRENT_TIMESTAMP), 'T', ' '), 'Z', '') DESC,
            id DESC
        ) AS ordem
      FROM fichas
    )
    UPDATE fichas
    SET kanban_ordem = (
      SELECT ranked.ordem
      FROM ranked
      WHERE ranked.id = fichas.id
    )
    WHERE kanban_ordem IS NULL OR kanban_ordem <= 0
  `);
}

async function autoEntregarFichasNaCostura() {
  const now = new Date().toISOString();
  const fichasParaAutoEntrega = await dbAll(
    `
      SELECT id
      FROM fichas
      WHERE
        status != 'entregue'
        AND kanban_status = 'na_costura'
        AND kanban_status_updated_at IS NOT NULL
        AND julianday(replace(replace(kanban_status_updated_at, 'T', ' '), 'Z', '')) <= julianday(?, '-7 days')
    `,
    [now]
  );
  const result = await dbRun(
    `
      UPDATE fichas
      SET
        status = 'entregue',
        data_entregue = COALESCE(data_entregue, ?),
        auto_entregue_em = COALESCE(auto_entregue_em, ?),
        data_atualizacao = ?
      WHERE
        status != 'entregue'
        AND kanban_status = 'na_costura'
        AND kanban_status_updated_at IS NOT NULL
        AND julianday(replace(replace(kanban_status_updated_at, 'T', ' '), 'Z', '')) <= julianday(?, '-7 days')
    `,
    [now, now, now, now]
  );

  if ((result?.rowsAffected || 0) > 0) {
    for (const ficha of fichasParaAutoEntrega) {
      await addSystemLog({
        eventType: 'pedido_auto_marcado',
        action: 'Pedido auto-marcado como entregue',
        fichaId: ficha?.id,
        details: {
          estado: 'entregue',
          origem: 'regra_kanban_na_costura_7_dias'
        }
      });
    }
    console.log(`[kanban] Auto-entrega aplicada em ${result.rowsAffected} ficha(s)`);
  }
}

function parseImagensDataCount(rawValue) {
  if (!rawValue) return 0;
  if (Array.isArray(rawValue)) return rawValue.length;
  if (typeof rawValue !== 'string') return 0;
  const trimmed = rawValue.trim();
  if (!trimmed) return 0;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (_) {
    return 0;
  }
}

async function addSystemLog({ eventType, action, fichaId = null, details = null }) {
  const normalizedType = String(eventType || '').trim().toLowerCase();
  const normalizedAction = String(action || '').trim();
  if (!normalizedType || !normalizedAction) return;

  const normalizedFichaId = Number.isInteger(Number(fichaId)) && Number(fichaId) > 0
    ? Number(fichaId)
    : null;

  const detailsValue = details && typeof details === 'object'
    ? JSON.stringify(details)
    : (typeof details === 'string' && details.trim() ? details : null);

  try {
    await dbRun(
      'INSERT INTO system_logs (event_type, action, ficha_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
      [normalizedType, normalizedAction, normalizedFichaId, detailsValue, new Date().toISOString()]
    );
  } catch (error) {
    console.error('[system-log] Falha ao registrar evento:', error?.message || error);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function formatTemperatureText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--°C';
  return `${Math.round(number)}°C`;
}

const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
const WEATHER_CACHE_MAX_SIZE = 200;
const WEATHER_PROVIDER_DISTANCE_LIMIT_KM = Number.isFinite(Number(process.env.WEATHER_PROVIDER_DISTANCE_LIMIT_KM))
  ? Number(process.env.WEATHER_PROVIDER_DISTANCE_LIMIT_KM)
  : 120;
const WEATHER_PROVIDER_DISABLE_AFTER_INACCURATE = Number.isFinite(Number(process.env.WEATHER_PROVIDER_DISABLE_AFTER_INACCURATE))
  ? Number(process.env.WEATHER_PROVIDER_DISABLE_AFTER_INACCURATE)
  : 3;
const WEATHER_PROVIDER_DISABLE_AFTER_FAILURES = Number.isFinite(Number(process.env.WEATHER_PROVIDER_DISABLE_AFTER_FAILURES))
  ? Number(process.env.WEATHER_PROVIDER_DISABLE_AFTER_FAILURES)
  : 5;
const WEATHER_PROVIDER_DISABLE_TTL_MS = Number.isFinite(Number(process.env.WEATHER_PROVIDER_DISABLE_TTL_MS))
  ? Number(process.env.WEATHER_PROVIDER_DISABLE_TTL_MS)
  : 6 * 60 * 60 * 1000;
const GITHUB_COMMIT_TIMEZONE = String(process.env.GITHUB_COMMIT_TIMEZONE || 'Etc/GMT+4').trim() || 'Etc/GMT+4';
const GITHUB_COMMIT_TIMEZONE_LABEL = 'GMT-4';
const weatherSnapshotCache = new Map();
const weatherGeoProviderStats = new Map();

function weatherIconFromCode(code) {
  const numericCode = Number(code);
  if (!Number.isFinite(numericCode)) return '🌤️';
  if (numericCode === 0) return '☀️';
  if (numericCode === 1 || numericCode === 2) return '🌤️';
  if (numericCode === 3) return '☁️';
  if (numericCode === 45 || numericCode === 48) return '🌫️';
  if (numericCode >= 51 && numericCode <= 67) return '🌦️';
  if (numericCode >= 71 && numericCode <= 77) return '❄️';
  if (numericCode >= 80 && numericCode <= 82) return '🌧️';
  if (numericCode >= 95) return '⛈️';
  return '🌤️';
}

function extractClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }

  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;

  const remote = String(req.socket?.remoteAddress || '').trim();
  if (!remote) return '';

  return remote.startsWith('::ffff:') ? remote.slice(7) : remote;
}

function isLocalHost(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;

  const noBrackets = raw.replace(/^\[|\]$/g, '');
  const hostOnly = noBrackets.replace(/:\d+$/, '');
  return (
    hostOnly === 'localhost' ||
    hostOnly === '127.0.0.1' ||
    hostOnly === '::1' ||
    hostOnly === '0.0.0.0' ||
    hostOnly === '::ffff:127.0.0.1'
  );
}

function normalizeBaseUrlCandidate(value, fallbackProtocol = 'https') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `${fallbackProtocol}://${raw}`.replace(/\/+$/, '');
}

function normalizeLocationText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getGeoDistanceKm(aLat, aLon, bLat, bLon) {
  const lat1 = Number(aLat);
  const lon1 = Number(aLon);
  const lat2 = Number(bLat);
  const lon2 = Number(bLon);
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }

  const toRad = (degrees) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function buildGeoResult(latitude, longitude, city) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const safeCity = String(city || '').trim() || 'sua região';
  return {
    latitude: lat,
    longitude: lon,
    city: safeCity
  };
}

function parseGeoFromIpInfo(data) {
  const loc = String(data?.loc || '').trim();
  const [lat, lon] = loc.split(',');
  return buildGeoResult(
    lat,
    lon,
    data?.city || data?.region || data?.country
  );
}

function getWeatherProviderStats(providerName) {
  const key = String(providerName || '').trim() || 'unknown';
  if (!weatherGeoProviderStats.has(key)) {
    weatherGeoProviderStats.set(key, {
      success: 0,
      failures: 0,
      accurate: 0,
      inaccurate: 0,
      selected: 0,
      disabledUntil: 0,
      lastStatus: '',
      lastError: ''
    });
  }

  return weatherGeoProviderStats.get(key);
}

function isWeatherProviderEnabled(providerName) {
  const stats = getWeatherProviderStats(providerName);
  const disabledUntil = Number(stats.disabledUntil);
  return !Number.isFinite(disabledUntil) || disabledUntil <= Date.now();
}

function disableWeatherProvider(providerName, reason) {
  const stats = getWeatherProviderStats(providerName);
  const now = Date.now();
  const nextDisabledUntil = now + WEATHER_PROVIDER_DISABLE_TTL_MS;

  if (Number(stats.disabledUntil) > now) return;

  stats.disabledUntil = nextDisabledUntil;
  stats.lastStatus = `disabled:${reason}`;
  console.warn(`[weather] provider=${providerName} disabled reason=${reason} ttl_ms=${WEATHER_PROVIDER_DISABLE_TTL_MS}`);
}

function registerWeatherProviderFailure(providerName, reason = '') {
  const stats = getWeatherProviderStats(providerName);
  stats.failures += 1;
  stats.lastStatus = 'failure';
  stats.lastError = reason;

  if (stats.failures >= WEATHER_PROVIDER_DISABLE_AFTER_FAILURES && stats.success === 0) {
    disableWeatherProvider(providerName, 'failures');
  }
}

function registerWeatherProviderSuccess(providerName, accuracy = 'unknown') {
  const stats = getWeatherProviderStats(providerName);
  stats.success += 1;
  stats.lastStatus = `success:${accuracy}`;
  stats.lastError = '';

  if (accuracy === 'accurate') {
    stats.accurate += 1;
    return;
  }

  if (accuracy === 'inaccurate') {
    stats.inaccurate += 1;
    if (
      stats.inaccurate >= WEATHER_PROVIDER_DISABLE_AFTER_INACCURATE
      && stats.inaccurate > stats.accurate
    ) {
      disableWeatherProvider(providerName, 'inaccurate');
    }
  }
}

function getWeatherGeoProviders(clientIp) {
  const ip = String(clientIp || '').trim();
  const local = isLocalHost(ip);

  return [
    {
      name: 'ipinfo',
      parse: parseGeoFromIpInfo,
      urls: !local && ip
        ? [`https://ipinfo.io/${encodeURIComponent(ip)}/json`, 'https://ipinfo.io/json']
        : ['https://ipinfo.io/json']
    }
  ];
}

function getReferenceGeoFromRequest(req) {
  const latitude = Number(req.headers['x-vercel-ip-latitude']);
  const longitude = Number(req.headers['x-vercel-ip-longitude']);
  const city = String(req.headers['x-vercel-ip-city'] || '').trim();

  if (!Number.isFinite(latitude) && !Number.isFinite(longitude) && !city) {
    return null;
  }

  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    city: city || null
  };
}

function isGeoCandidateAccurate(candidate, referenceGeo) {
  if (!referenceGeo) {
    return {
      accuracy: 'unknown',
      distanceKm: null,
      cityMatch: null
    };
  }

  const hasReferenceCoords = Number.isFinite(referenceGeo.latitude) && Number.isFinite(referenceGeo.longitude);
  const distanceKm = hasReferenceCoords
    ? getGeoDistanceKm(candidate.latitude, candidate.longitude, referenceGeo.latitude, referenceGeo.longitude)
    : null;

  if (Number.isFinite(distanceKm)) {
    return {
      accuracy: distanceKm <= WEATHER_PROVIDER_DISTANCE_LIMIT_KM ? 'accurate' : 'inaccurate',
      distanceKm,
      cityMatch: null
    };
  }

  const referenceCity = normalizeLocationText(referenceGeo.city);
  const candidateCity = normalizeLocationText(candidate.city);
  if (referenceCity && candidateCity) {
    const cityMatch = referenceCity === candidateCity;
    return {
      accuracy: cityMatch ? 'accurate' : 'inaccurate',
      distanceKm: null,
      cityMatch
    };
  }

  return {
    accuracy: 'unknown',
    distanceKm: null,
    cityMatch: null
  };
}

async function queryGeoProvider(provider) {
  let lastFailure = 'sem_resposta';

  for (const url of provider.urls) {
    try {
      const response = await fetchWithTimeout(url, { method: 'GET' }, 5000);
      if (!response.ok) {
        lastFailure = `http_${response.status}`;
        continue;
      }

      const data = await response.json();
      const parsed = provider.parse(data);
      if (parsed) {
        return {
          ...parsed,
          sourceUrl: url
        };
      }

      lastFailure = 'payload_invalido';
    } catch (error) {
      lastFailure = error?.message ? String(error.message) : 'erro_desconhecido';
    }
  }

  return {
    error: lastFailure
  };
}

function readWeatherCache(cacheKey) {
  const key = String(cacheKey || 'global');
  const entry = weatherSnapshotCache.get(key);
  if (!entry) return null;

  if ((Date.now() - entry.updatedAt) > WEATHER_CACHE_TTL_MS) {
    weatherSnapshotCache.delete(key);
    return null;
  }

  return entry.snapshot || null;
}

function writeWeatherCache(cacheKey, snapshot) {
  const key = String(cacheKey || 'global');
  weatherSnapshotCache.set(key, {
    updatedAt: Date.now(),
    snapshot
  });

  while (weatherSnapshotCache.size > WEATHER_CACHE_MAX_SIZE) {
    const oldestKey = weatherSnapshotCache.keys().next().value;
    if (!oldestKey) break;
    weatherSnapshotCache.delete(oldestKey);
  }
}

async function resolveGeoByIp(req, clientIp) {
  const ip = String(clientIp || '').trim();
  const referenceGeo = getReferenceGeoFromRequest(req);

  const allProviders = getWeatherGeoProviders(ip);
  let providers = allProviders.filter(provider => isWeatherProviderEnabled(provider.name));
  if (providers.length === 0) {
    providers = allProviders;
  }

  const candidates = [];
  for (const provider of providers) {
    const result = await queryGeoProvider(provider);
    if (!result || result.error) {
      registerWeatherProviderFailure(provider.name, result?.error || 'sem_resposta');
      continue;
    }

    const evaluation = isGeoCandidateAccurate(result, referenceGeo);
    registerWeatherProviderSuccess(provider.name, evaluation.accuracy);

    candidates.push({
      provider: provider.name,
      latitude: result.latitude,
      longitude: result.longitude,
      city: result.city,
      accuracy: evaluation.accuracy,
      distanceKm: evaluation.distanceKm,
      cityMatch: evaluation.cityMatch
    });

    if (!referenceGeo || evaluation.accuracy === 'accurate') {
      break;
    }
  }

  if (candidates.length === 0) return null;

  let selected = candidates[0];
  if (referenceGeo) {
    const accurateCandidates = candidates.filter(candidate => candidate.accuracy === 'accurate');
    const pool = accurateCandidates.length > 0 ? accurateCandidates : candidates;

    const poolWithDistance = pool.filter(candidate => Number.isFinite(candidate.distanceKm));
    if (poolWithDistance.length > 0) {
      selected = poolWithDistance.reduce((best, current) => (
        current.distanceKm < best.distanceKm ? current : best
      ));
    } else {
      const cityMatchCandidate = pool.find(candidate => candidate.cityMatch === true);
      selected = cityMatchCandidate || pool[0];
    }
  }

  const selectedStats = getWeatherProviderStats(selected.provider);
  selectedStats.selected += 1;

  return {
    latitude: selected.latitude,
    longitude: selected.longitude,
    city: selected.city,
    provider: selected.provider
  };
}

function resolveGithubRepoSlug() {
  const direct = String(process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || '').trim();
  if (/^[^/\s]+\/[^/\s]+$/.test(direct)) return direct;

  const owner = String(process.env.VERCEL_GIT_REPO_OWNER || '').trim();
  const repo = String(process.env.VERCEL_GIT_REPO_SLUG || '').trim();
  if (owner && repo) return `${owner}/${repo}`;

  return '';
}

function isCloudinaryConfigured() {
  const cloudName = String(CLOUDINARY_CONFIG.cloudName || '').trim();
  const apiKey = String(CLOUDINARY_CONFIG.apiKey || '').trim();
  const apiSecret = String(CLOUDINARY_CONFIG.apiSecret || '').trim();

  const invalidCloudName = !cloudName || /^SEU_/i.test(cloudName);
  const invalidApiKey = !apiKey || /^SUA_/i.test(apiKey) || /^SEU_/i.test(apiKey);
  const invalidApiSecret = !apiSecret || /^SEU_/i.test(apiSecret) || /^SUA_/i.test(apiSecret);

  return !(invalidCloudName || invalidApiKey || invalidApiSecret);
}

async function getTursoConnectionStatus() {
  try {
    await executeDb('SELECT 1');
    return {
      status: 'ok',
      message: 'Conectado (aws-us-east-1.turso.io)'
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Falha: ${error.message}`
    };
  }
}

async function getCloudinaryConnectionStatus() {
  if (!isCloudinaryConfigured()) {
    return {
      status: 'warning',
      message: 'Não configurado'
    };
  }

  try {
    const credentials = Buffer.from(`${CLOUDINARY_CONFIG.apiKey}:${CLOUDINARY_CONFIG.apiSecret}`).toString('base64');
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/resources/image?max_results=1`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`
      }
    }, 6000);

    if (!response.ok) {
      return {
        status: 'error',
        message: `Falha HTTP ${response.status}`
      };
    }

    return {
      status: 'ok',
      message: `Conectado (${CLOUDINARY_CONFIG.cloudName})`
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Sem resposta: ${error.message}`
    };
  }
}

async function getVercelAppStatus(req) {
  const envVercelUrl = String(process.env.VERCEL_URL || '').trim();
  const envProductionUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const hostHeader = String(req.headers.host || '').trim();
  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').trim() || 'https';
  const hostOnly = hostHeader.replace(/:\d+$/, '').trim();
  const candidates = [];

  if (hostHeader && !isLocalHost(hostOnly)) {
    candidates.push(normalizeBaseUrlCandidate(`${protocol}://${hostHeader}`, protocol));
  }
  if (envProductionUrl) {
    candidates.push(normalizeBaseUrlCandidate(envProductionUrl, 'https'));
  }
  if (envVercelUrl) {
    candidates.push(normalizeBaseUrlCandidate(envVercelUrl, 'https'));
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  if (uniqueCandidates.length === 0) {
    return {
      status: 'warning',
      message: 'Ambiente Vercel não detectado',
      url: null
    };
  }

  const attempts = [];
  for (const baseUrl of uniqueCandidates) {
    const healthUrl = `${baseUrl.replace(/\/+$/, '')}/api/health`;
    try {
      const response = await fetchWithTimeout(healthUrl, { method: 'GET' }, 5000);
      if (response.ok) {
        return {
          status: 'ok',
          message: 'Aplicação acessível',
          url: baseUrl
        };
      }

      attempts.push({ baseUrl, statusCode: response.status });
    } catch (error) {
      attempts.push({ baseUrl, errorMessage: error.message });
    }
  }

  const unauthorizedAttempt = attempts.find(item => Number(item.statusCode) === 401);
  if (unauthorizedAttempt) {
    return {
      status: 'warning',
      message: 'Deployment protegido (HTTP 401)',
      url: unauthorizedAttempt.baseUrl
    };
  }

  const firstHttpAttempt = attempts.find(item => Number.isFinite(item.statusCode));
  if (firstHttpAttempt) {
    return {
      status: 'error',
      message: `Falha HTTP ${firstHttpAttempt.statusCode}`,
      url: firstHttpAttempt.baseUrl
    };
  }

  const firstNetworkAttempt = attempts.find(item => item.errorMessage);
  if (firstNetworkAttempt) {
    return {
      status: 'error',
      message: `Sem resposta: ${firstNetworkAttempt.errorMessage}`,
      url: firstNetworkAttempt.baseUrl
    };
  }

  return {
    status: 'error',
    message: 'Não foi possível verificar o status da aplicação',
    url: uniqueCandidates[0]
  };
}

function formatGithubDate(value) {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: GITHUB_COMMIT_TIMEZONE
  }).format(new Date(parsed));
}

async function getGithubCommitStatus() {
  const repoSlug = resolveGithubRepoSlug();
  const commitShaHint = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
  const githubToken = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();

  if (!repoSlug && !commitShaHint) {
    return {
      status: 'warning',
      message: 'Repositório não configurado',
      sha: null,
      url: null
    };
  }

  if (!repoSlug && commitShaHint) {
    return {
      status: 'warning',
      message: `SHA local: ${commitShaHint.slice(0, 7)}`,
      sha: commitShaHint,
      url: null
    };
  }

  const commitsUrl = `https://api.github.com/repos/${repoSlug}/commits?per_page=1`;
  try {
    const headers = {
      'User-Agent': 'ficha-prod-status',
      Accept: 'application/vnd.github+json'
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetchWithTimeout(commitsUrl, {
      method: 'GET',
      headers
    }, 6000);

    if (!response.ok) {
      if (commitShaHint) {
        return {
          status: 'warning',
          message: `GitHub indisponível (HTTP ${response.status})`,
          sha: commitShaHint,
          url: `https://github.com/${repoSlug}/commit/${commitShaHint}`
        };
      }

      return {
        status: 'error',
        message: `Falha HTTP ${response.status}`,
        sha: null,
        url: `https://github.com/${repoSlug}`
      };
    }

    const data = await response.json();
    const latest = Array.isArray(data) ? data[0] : null;
    const sha = String(latest?.sha || commitShaHint || '').trim();
    const date = formatGithubDate(latest?.commit?.author?.date || '');
    const commitUrl = sha ? `https://github.com/${repoSlug}/commit/${sha}` : `https://github.com/${repoSlug}`;

    return {
      status: 'ok',
      message: date ? `Último commit em ${date} (${GITHUB_COMMIT_TIMEZONE_LABEL})` : 'Último commit encontrado',
      sha: sha || null,
      url: commitUrl
    };
  } catch (error) {
    if (commitShaHint) {
      return {
        status: 'warning',
        message: `Usando SHA local (${commitShaHint.slice(0, 7)})`,
        sha: commitShaHint,
        url: `https://github.com/${repoSlug}/commit/${commitShaHint}`
      };
    }

    return {
      status: 'error',
      message: `Sem resposta: ${error.message}`,
      sha: null,
      url: `https://github.com/${repoSlug}`
    };
  }
}

async function getLastFichaCreatedAt() {
  try {
    const row = await dbGet(
      `
        SELECT data_criacao, data_atualizacao
        FROM fichas
        ORDER BY replace(replace(COALESCE(data_criacao, data_atualizacao, CURRENT_TIMESTAMP), 'T', ' '), 'Z', '') DESC, id DESC
        LIMIT 1
      `
    );

    return row?.data_criacao || row?.data_atualizacao || null;
  } catch (_) {
    return null;
  }
}

async function getWeatherSnapshot(req) {
  const fallback = {
    city: 'sua região',
    temperatureText: '--°C',
    icon: '🌤️',
    provider: null
  };

  const clientIp = extractClientIp(req);
  const cacheKey = isLocalHost(clientIp) ? 'global' : clientIp;
  const cached = readWeatherCache(cacheKey);

  const geo = await resolveGeoByIp(req, clientIp);
  if (!geo) return cached || fallback;

  const latitude = Number(geo.latitude);
  const longitude = Number(geo.longitude);
  const city = String(geo.city || fallback.city).trim() || fallback.city;
  const provider = String(geo.provider || '').trim() || null;
  const cityFallback = {
    city,
    temperatureText: fallback.temperatureText,
    icon: fallback.icon,
    provider
  };

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return cached || cityFallback;

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
    const weatherResponse = await fetchWithTimeout(weatherUrl, { method: 'GET' }, 5000);
    if (!weatherResponse.ok) {
      return cached || {
        city,
        temperatureText: fallback.temperatureText,
        icon: fallback.icon,
        provider
      };
    }

    const weatherData = await weatherResponse.json();
    const current = weatherData?.current || {};
    const snapshot = {
      city,
      temperatureText: formatTemperatureText(current.temperature_2m),
      icon: weatherIconFromCode(current.weather_code),
      provider
    };
    writeWeatherCache(cacheKey, snapshot);
    return snapshot;
  } catch (_) {
    return cached || {
      city,
      temperatureText: fallback.temperatureText,
      icon: fallback.icon,
      provider
    };
  }
}

// ==================== ROTAS DA API ====================

app.use('/api', async (req, res, next) => {
  try {
    await ensureDatabaseInitialized();
    next();
  } catch (error) {
    console.error('[db] Falha ao inicializar banco para requisição:', error);
    res.status(503).json({ error: 'Serviço temporariamente indisponível' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    setShortCdnCache(res, 15);
    await executeDb('SELECT 1');
    res.json({ status: 'ok', database: 'turso connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Listar todas as fichas
app.get('/api/fichas', async (req, res) => {
  try {
    const queryData = parseWithZod(res, fichaQuerySchema, req.query, 'Parâmetros de busca inválidos');
    if (!queryData) return;

    await autoEntregarFichasNaCostura();

    const {
      status,
      cliente,
      vendedor,
      dataInicio,
      dataFim,
      termo,
      evento,
      atrasado,
      paged,
      resumido,
      page,
      pageSize
    } = queryData;

    const selectColumns = resumido
      ? [
        'id',
        'cliente',
        'vendedor',
        'data_inicio',
        'numero_venda',
        'data_entrega',
        'status',
        'evento',
        'arte',
        'material',
        'kanban_status',
        'kanban_ordem',
        'imagem_data',
        'imagens_data',
        'produtos'
      ].join(', ')
      : '*';

    let whereClause = ' WHERE 1=1';
    const params = [];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (cliente) {
      whereClause += ' AND cliente LIKE ?';
      params.push(`%${cliente}%`);
    }

    if (vendedor) {
      whereClause += ' AND vendedor = ?';
      params.push(vendedor);
    }

    if (dataInicio) {
      whereClause += ' AND data_inicio >= ?';
      params.push(dataInicio);
    }

    if (dataFim) {
      whereClause += ' AND data_inicio <= ?';
      params.push(dataFim);
    }

    if (evento) {
      whereClause += ' AND evento = ?';
      params.push(evento);
    }

    if (atrasado) {
      whereClause += " AND status = 'pendente' AND data_entrega IS NOT NULL AND trim(data_entrega) != '' AND date(data_entrega) < date('now', 'localtime')";
    }

    const parseFichas = fichas => fichas.map(ficha => {
      const registro = { ...ficha };
      if (typeof registro.produtos === 'string') {
        try {
          registro.produtos = JSON.parse(registro.produtos);
        } catch (_) {
          registro.produtos = [];
        }
      }
      return registro;
    });
    const resumirFicha = ficha => (resumido ? summarizeFicha(ficha) : ficha);

    setShortCdnCache(res, termo ? 15 : 30);

    if (paged) {
      const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
      const requestedPage = Math.max(Number(page) || 1, 1);

      if (termo) {
        const fichasBrutas = await dbAll(`SELECT * FROM fichas${whereClause} ORDER BY id DESC`, params);
        const fichasFiltradas = parseFichas(fichasBrutas).filter(ficha => fichaCorrespondeTermoBusca(ficha, termo));
        const total = fichasFiltradas.length;
        const totalPages = Math.max(1, Math.ceil(total / safePageSize));
        const currentPage = Math.min(requestedPage, totalPages);
        const offset = (currentPage - 1) * safePageSize;
        const items = fichasFiltradas
          .slice(offset, offset + safePageSize)
          .map(resumirFicha);

        return res.json({
          items,
          page: currentPage,
          pageSize: safePageSize,
          total,
          totalPages,
          hasNext: currentPage < totalPages
        });
      }

      const totalResult = await dbGet(`SELECT COUNT(*) AS total FROM fichas${whereClause}`, params);
      const total = Number(totalResult?.total) || 0;
      const totalPages = Math.max(1, Math.ceil(total / safePageSize));
      const currentPage = Math.min(requestedPage, totalPages);
      const offset = (currentPage - 1) * safePageSize;
      const query = `SELECT ${selectColumns} FROM fichas${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`;
      const fichas = await dbAll(query, [...params, safePageSize, offset]);
      const items = parseFichas(fichas).map(resumirFicha);
      return res.json({
        items,
        page: currentPage,
        pageSize: safePageSize,
        total,
        totalPages,
        hasNext: currentPage < totalPages
      });
    }

    const query = `SELECT ${termo ? '*' : selectColumns} FROM fichas${whereClause} ORDER BY id DESC`;
    const fichas = await dbAll(query, params);
    let fichasFormatadas = parseFichas(fichas);
    if (termo) {
      fichasFormatadas = fichasFormatadas
        .filter(ficha => fichaCorrespondeTermoBusca(ficha, termo))
        .map(resumirFicha);
    }

    res.json(fichasFormatadas);
  } catch (error) {
    console.error('Erro ao listar fichas:', error);
    res.status(500).json({ error: 'Erro ao listar fichas' });
  }
});

// Buscar ficha por ID
app.get('/api/fichas/:id', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID da ficha inválido');
    if (!paramsData) return;

    const ficha = await dbGet('SELECT * FROM fichas WHERE id = ?', [paramsData.id]);

    if (!ficha) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    if (ficha.produtos) {
      try {
        ficha.produtos = JSON.parse(ficha.produtos);
      } catch (e) {
        ficha.produtos = [];
      }
    }

    res.json(ficha);
  } catch (error) {
    console.error('Erro ao buscar ficha:', error);
    res.status(500).json({ error: 'Erro ao buscar ficha' });
  }
});

// Criar nova ficha
app.post('/api/fichas', async (req, res) => {
  const idempotencyRoute = IDEMPOTENCY_ROUTE_CREATE_FICHA;
  const idempotencyKey = normalizeIdempotencyKey(req.get('Idempotency-Key'));
  let idempotencyReservationActive = false;

  try {
    const bodyData = parseWithZod(res, fichaBodySchema, req.body, 'Dados da ficha inválidos');
    if (!bodyData) return;

    if (idempotencyKey) {
      const existente = await getIdempotencyRecord(idempotencyRoute, idempotencyKey);
      if (existente) {
        if (existente.status === IDEMPOTENCY_STATUS_COMPLETED) {
          const statusCode = Number(existente.status_code) || 201;
          const payload = parseStoredIdempotentResponse(existente.response_body, existente.resource_id);
          return res.status(statusCode).json(payload);
        }
        return res.status(409).json({
          error: 'Uma solicitação de salvamento já está em processamento. Aguarde alguns segundos e tente novamente.'
        });
      }

      try {
        await reserveIdempotencyKey(idempotencyRoute, idempotencyKey);
        idempotencyReservationActive = true;
      } catch (reserveError) {
        if (isUniqueConstraintError(reserveError)) {
          const registro = await getIdempotencyRecord(idempotencyRoute, idempotencyKey);
          if (registro?.status === IDEMPOTENCY_STATUS_COMPLETED) {
            const statusCode = Number(registro.status_code) || 201;
            const payload = parseStoredIdempotentResponse(registro.response_body, registro.resource_id);
            return res.status(statusCode).json(payload);
          }
          return res.status(409).json({
            error: 'Uma solicitação de salvamento já está em processamento. Aguarde alguns segundos e tente novamente.'
          });
        }
        throw reserveError;
      }
    }

    const dados = normalizeFichaPayload(bodyData);
    const produtosJson = JSON.stringify(dados.produtos || []);
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO fichas (
        cliente, vendedor, data_inicio, numero_venda, data_entrega, evento,
        material, composicao, cor_material, manga, acabamento_manga, largura_manga, cor_acabamento_manga,
        gola, cor_gola, acabamento_gola, largura_gola, cor_peitilho_interno, cor_peitilho_externo, cor_pe_de_gola_interno, cor_pe_de_gola_externo, cor_botao,
        abertura_lateral, cor_abertura_lateral, reforco_gola, cor_reforco, bolso,
        filete, filete_local, filete_cor, faixa, faixa_local, faixa_cor,
        arte, com_nomes, observacoes, imagem_data, imagens_data, produtos, data_criacao, data_atualizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      dados.cliente, dados.vendedor, dados.dataInicio, dados.numeroVenda,
      dados.dataEntrega, dados.evento || 'nao',
      dados.material, dados.composicao, dados.corMaterial, dados.manga,
      dados.acabamentoManga, dados.larguraManga, dados.corAcabamentoManga,
      dados.gola, dados.corGola, dados.acabamentoGola,
      dados.larguraGola, dados.corPeitilhoInterno, dados.corPeitilhoExterno, dados.corPeDeGolaInterno, dados.corPeDeGolaExterno, dados.corBotao,
      dados.aberturaLateral, dados.corAberturaLateral, dados.reforcoGola, dados.corReforco, dados.bolso,
      dados.filete, dados.fileteLocal, dados.fileteCor,
      dados.faixa, dados.faixaLocal, dados.faixaCor,
      dados.arte, dados.comNomes, dados.observacoes, dados.imagemData, dados.imagensData,
      produtosJson, now, now
    ];

    const result = await dbRun(sql, params);
    const novoId = Number(result.lastInsertRowid);

    const ordemKanban = await getNextKanbanOrder('pendente', novoId);
    await dbRun('UPDATE fichas SET kanban_ordem = ? WHERE id = ?', [ordemKanban, novoId]);
    const payload = { id: novoId, message: 'Ficha criada com sucesso' };

    if (idempotencyKey) {
      await completeIdempotencyKey(idempotencyRoute, idempotencyKey, 201, payload, novoId);
      idempotencyReservationActive = false;
    }

    // Atualizar tabela de clientes
    if (dados.cliente) {
      await atualizarCliente(dados.cliente, dados.dataInicio);
    }

    await addSystemLog({
      eventType: 'ficha_adicionada',
      action: 'Ficha adicionada',
      fichaId: novoId,
      details: {
        cliente: dados.cliente || '',
        vendedor: dados.vendedor || '',
        numeroVenda: dados.numeroVenda || '',
        status: 'pendente'
      }
    });

    console.log(`[fichas] Ficha #${novoId} criada`);
    res.status(201).json(payload);
  } catch (error) {
    if (idempotencyKey && idempotencyReservationActive) {
      try {
        await releaseIdempotencyReservation(idempotencyRoute, idempotencyKey);
      } catch (cleanupError) {
        console.error('[idempotency] Falha ao limpar reserva pendente:', cleanupError);
      }
    }

    console.error('Erro ao criar ficha:', error);
    res.status(500).json({
      error: 'Erro ao criar ficha',
      details: error?.message || 'Erro interno'
    });
  }
});

// Atualizar ficha
app.put('/api/fichas/:id', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID da ficha inválido');
    if (!paramsData) return;

    const bodyData = parseWithZod(res, fichaBodySchema, req.body, 'Dados da ficha inválidos');
    if (!bodyData) return;

    const fichaExiste = await dbGet(
      'SELECT id, status, kanban_status, imagens_data, imagem_data FROM fichas WHERE id = ?',
      [paramsData.id]
    );

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    const dados = normalizeFichaPayload(bodyData);
    const produtosJson = JSON.stringify(dados.produtos || []);
    const now = new Date().toISOString();

    const sql = `
      UPDATE fichas SET
        cliente = ?, vendedor = ?, data_inicio = ?, numero_venda = ?,
        data_entrega = ?, evento = ?, status = ?,
        material = ?, composicao = ?, cor_material = ?, manga = ?,
        acabamento_manga = ?, largura_manga = ?, cor_acabamento_manga = ?,
        gola = ?, cor_gola = ?, acabamento_gola = ?,
        largura_gola = ?, cor_peitilho_interno = ?, cor_peitilho_externo = ?, cor_pe_de_gola_interno = ?, cor_pe_de_gola_externo = ?, cor_botao = ?,
        abertura_lateral = ?, cor_abertura_lateral = ?, reforco_gola = ?, cor_reforco = ?, bolso = ?,
        filete = ?, filete_local = ?, filete_cor = ?,
        faixa = ?, faixa_local = ?, faixa_cor = ?,
        arte = ?, com_nomes = ?, observacoes = ?, imagem_data = ?, imagens_data = ?,
        produtos = ?, data_atualizacao = ?
      WHERE id = ?
    `;

    const params = [
      dados.cliente, dados.vendedor, dados.dataInicio, dados.numeroVenda,
      dados.dataEntrega, dados.evento || 'nao', dados.status || 'pendente',
      dados.material, dados.composicao, dados.corMaterial, dados.manga,
      dados.acabamentoManga, dados.larguraManga, dados.corAcabamentoManga,
      dados.gola, dados.corGola, dados.acabamentoGola,
      dados.larguraGola, dados.corPeitilhoInterno, dados.corPeitilhoExterno, dados.corPeDeGolaInterno, dados.corPeDeGolaExterno, dados.corBotao,
      dados.aberturaLateral, dados.corAberturaLateral, dados.reforcoGola, dados.corReforco, dados.bolso,
      dados.filete, dados.fileteLocal, dados.fileteCor,
      dados.faixa, dados.faixaLocal, dados.faixaCor,
      dados.arte, dados.comNomes, dados.observacoes, dados.imagemData, dados.imagensData,
      produtosJson, now, paramsData.id
    ];

    await dbRun(sql, params);

    await addSystemLog({
      eventType: 'ficha_editada',
      action: 'Ficha editada',
      fichaId: paramsData.id,
      details: {
        cliente: dados.cliente || '',
        vendedor: dados.vendedor || '',
        numeroVenda: dados.numeroVenda || ''
      }
    });

    const imagensAntes = parseImagensDataCount(fichaExiste.imagens_data);
    const imagensDepois = parseImagensDataCount(dados.imagensData);
    if (imagensDepois > imagensAntes) {
      await addSystemLog({
        eventType: 'imagem_adicionada',
        action: 'Imagem adicionada',
        fichaId: paramsData.id,
        details: {
          quantidade: imagensDepois - imagensAntes
        }
      });
    } else if (imagensDepois < imagensAntes) {
      await addSystemLog({
        eventType: 'imagem_deletada',
        action: 'Imagem deletada',
        fichaId: paramsData.id,
        details: {
          quantidade: imagensAntes - imagensDepois
        }
      });
    }

    if (String(fichaExiste.status || '') !== String(dados.status || 'pendente')) {
      await addSystemLog({
        eventType: 'status_pedido_alterado',
        action: 'Status do pedido alterado',
        fichaId: paramsData.id,
        details: {
          de: String(fichaExiste.status || ''),
          para: String(dados.status || 'pendente')
        }
      });
    }

    console.log(`[fichas] Ficha #${paramsData.id} atualizada`);
    res.json({ id: paramsData.id, message: 'Ficha atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar ficha:', error);
    res.status(500).json({
      error: 'Erro ao atualizar ficha',
      details: error?.message || 'Erro interno'
    });
  }
});

// Marcar ficha como entregue
app.patch('/api/fichas/:id/entregar', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID da ficha inválido');
    if (!paramsData) return;

    const fichaExiste = await dbGet('SELECT id, cliente FROM fichas WHERE id = ?', [paramsData.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    const now = new Date().toISOString();
    await dbRun(
      `UPDATE fichas SET status = 'entregue', data_entregue = ?, auto_entregue_em = NULL, data_atualizacao = ? WHERE id = ?`,
      [now, now, paramsData.id]
    );

    await addSystemLog({
      eventType: 'pedido_entregue',
      action: 'Pedido entregue',
      fichaId: paramsData.id,
      details: { origem: 'manual' }
    });

    console.log(`[fichas] Ficha #${paramsData.id} marcada como entregue`);
    res.json({ message: 'Ficha marcada como entregue' });
  } catch (error) {
    console.error('Erro ao marcar como entregue:', error);
    res.status(500).json({ error: 'Erro ao marcar como entregue' });
  }
});

// Desmarcar ficha (voltar para pendente)
app.patch('/api/fichas/:id/pendente', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID da ficha inválido');
    if (!paramsData) return;

    const fichaExiste = await dbGet('SELECT id FROM fichas WHERE id = ?', [paramsData.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    const now = new Date().toISOString();
    await dbRun(
      `UPDATE fichas SET status = 'pendente', data_entregue = NULL, auto_entregue_em = NULL, data_atualizacao = ? WHERE id = ?`,
      [now, paramsData.id]
    );

    await addSystemLog({
      eventType: 'pedido_reaberto',
      action: 'Pedido voltou para pendente',
      fichaId: paramsData.id
    });

    console.log(`[fichas] Ficha #${paramsData.id} voltou para pendente`);
    res.json({ message: 'Ficha marcada como pendente' });
  } catch (error) {
    console.error('Erro ao marcar como pendente:', error);
    res.status(500).json({ error: 'Erro ao marcar como pendente' });
  }
});

app.get('/api/system-status', async (req, res) => {
  setShortCdnCache(res, 60);
  const [
    tursoStatus,
    cloudinaryStatus,
    vercelStatus,
    githubStatus,
    weather,
    lastFichaCreatedAt
  ] = await Promise.all([
    getTursoConnectionStatus(),
    getCloudinaryConnectionStatus(),
    getVercelAppStatus(req),
    getGithubCommitStatus(),
    getWeatherSnapshot(req),
    getLastFichaCreatedAt()
  ]);

  res.json({
    status: 'ok',
    generatedAt: new Date().toISOString(),
    lastFichaCreatedAt,
    weather,
    systems: {
      turso: tursoStatus,
      cloudinary: cloudinaryStatus,
      vercel: vercelStatus,
      github: githubStatus
    }
  });
});

// Atualizar status do kanban
app.patch('/api/fichas/:id/kanban-status', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID da ficha inválido');
    if (!paramsData) return;

    const bodyData = parseWithZod(res, kanbanStatusBodySchema, req.body, 'Dados de status do kanban inválidos');
    if (!bodyData) return;

    const fichaExiste = await dbGet('SELECT id, kanban_status FROM fichas WHERE id = ?', [paramsData.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    const requestedStatus = bodyData.status ?? bodyData.kanbanStatus;
    const kanbanStatus = typeof requestedStatus === 'string'
      ? requestedStatus.trim().toLowerCase()
      : '';

    if (!KANBAN_STATUS_VALUES.has(kanbanStatus)) {
      return res.status(400).json({
        error: 'Status de kanban inválido. Use: pendente, exportando, fila_impressao, sublimando, na_costura.'
      });
    }

    const now = new Date().toISOString();
    const kanbanOrder = await getNextKanbanOrder(kanbanStatus, paramsData.id);
    await dbRun(
      'UPDATE fichas SET kanban_status = ?, kanban_status_updated_at = ?, kanban_ordem = ?, data_atualizacao = ? WHERE id = ?',
      [kanbanStatus, now, kanbanOrder, now, paramsData.id]
    );

    await addSystemLog({
      eventType: 'status_kanban',
      action: 'Status no kanban alterado',
      fichaId: paramsData.id,
      details: {
        de: String(fichaExiste.kanban_status || ''),
        para: kanbanStatus
      }
    });

    console.log(`[kanban] Ficha #${paramsData.id} atualizada: ${kanbanStatus}`);
    res.json({
      id: paramsData.id,
      kanbanStatus,
      kanbanOrder,
      message: 'Status do kanban atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar status do kanban:', error);
    res.status(500).json({ error: 'Erro ao atualizar status do kanban' });
  }
});

// Atualizar ordem manual dentro de uma coluna do kanban
app.patch('/api/kanban/order', async (req, res) => {
  try {
    const bodyData = parseWithZod(res, kanbanOrderBodySchema, req.body, 'Dados de ordenação do kanban inválidos');
    if (!bodyData) return;

    const status = bodyData.status;
    const orderedIdsRaw = bodyData.orderedIds;
    const orderedIds = [];
    const seen = new Set();

    for (const value of orderedIdsRaw) {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      orderedIds.push(id);
      seen.add(id);
    }

    const now = new Date().toISOString();

    for (let index = 0; index < orderedIds.length; index++) {
      await dbRun(
        'UPDATE fichas SET kanban_ordem = ?, data_atualizacao = ? WHERE id = ? AND kanban_status = ?',
        [index + 1, now, orderedIds[index], status]
      );
    }

    res.json({
      status,
      updated: orderedIds.length,
      message: 'Ordem do kanban atualizada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar ordem do kanban:', error);
    res.status(500).json({ error: 'Erro ao atualizar ordem do kanban' });
  }
});

// Deletar ficha
app.delete('/api/fichas/:id', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID da ficha inválido');
    if (!paramsData) return;

    const fichaExiste = await dbGet('SELECT id FROM fichas WHERE id = ?', [paramsData.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    await dbRun('DELETE FROM fichas WHERE id = ?', [paramsData.id]);

    await addSystemLog({
      eventType: 'ficha_deletada',
      action: 'Ficha deletada',
      fichaId: paramsData.id,
      details: {
        cliente: String(fichaExiste.cliente || '')
      }
    });

    console.log(`[fichas] Ficha #${paramsData.id} deletada`);
    res.json({ message: 'Ficha deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar ficha:', error);
    res.status(500).json({ error: 'Erro ao deletar ficha' });
  }
});

// Buscar clientes (autocomplete)
app.get('/api/system-log', async (req, res) => {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit || '200'), 10);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 500)
      : 200;

    const logs = await dbAll(
      `
        SELECT
          sl.id,
          sl.event_type,
          sl.action,
          sl.ficha_id,
          sl.details,
          sl.created_at,
          f.cliente AS ficha_cliente
        FROM system_logs sl
        LEFT JOIN fichas f ON f.id = sl.ficha_id
        ORDER BY replace(replace(sl.created_at, 'T', ' '), 'Z', '') DESC, sl.id DESC
        LIMIT ?
      `,
      [limit]
    );

    const normalized = logs.map(item => {
      let parsedDetails = item.details;
      if (typeof item.details === 'string' && item.details.trim()) {
        try {
          parsedDetails = JSON.parse(item.details);
        } catch (_) {
          parsedDetails = item.details;
        }
      }

      return {
        id: item.id,
        eventType: item.event_type,
        action: item.action,
        fichaId: item.ficha_id ?? null,
        cliente: (parsedDetails && typeof parsedDetails === 'object' && typeof parsedDetails.cliente === 'string' && parsedDetails.cliente.trim())
          ? parsedDetails.cliente.trim()
          : (item.ficha_cliente ? String(item.ficha_cliente) : ''),
        details: parsedDetails,
        createdAt: item.created_at
      };
    });

    res.json(normalized);
  } catch (error) {
    console.error('Erro ao listar log do sistema:', error);
    res.status(500).json({ error: 'Erro ao listar log do sistema' });
  }
});

app.post('/api/system-log', async (req, res) => {
  try {
    const eventType = String(req.body?.eventType || '').trim().toLowerCase();
    const action = String(req.body?.action || '').trim();
    const rawFichaId = req.body?.fichaId;
    const fichaId = Number.isInteger(Number(rawFichaId)) && Number(rawFichaId) > 0
      ? Number(rawFichaId)
      : null;
    const details = req.body?.details && typeof req.body.details === 'object'
      ? req.body.details
      : null;

    if (!eventType || !action) {
      return res.status(400).json({ error: 'eventType e action são obrigatórios' });
    }

    await addSystemLog({ eventType, action, fichaId, details });
    res.status(201).json({ message: 'Evento registrado' });
  } catch (error) {
    console.error('Erro ao registrar log do sistema:', error);
    res.status(500).json({ error: 'Erro ao registrar log do sistema' });
  }
});

app.get('/api/clientes', async (req, res) => {
  try {
    setShortCdnCache(res, 120);
    const queryData = parseWithZod(res, clientesQuerySchema, req.query, 'Parâmetros de busca de clientes inválidos');
    if (!queryData) return;

    const { termo } = queryData;
    let query = 'SELECT nome FROM clientes';
    const params = [];

    if (termo) {
      query += ' WHERE nome LIKE ?';
      params.push(`%${termo}%`);
    }

    query += ' ORDER BY ultimo_pedido DESC LIMIT 50';

    const clientes = await dbAll(query, params);
    res.json(clientes.map(c => c.nome));
  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// Listar todos os clientes com detalhes
app.get('/api/clientes/lista', async (req, res) => {
  try {
    setShortCdnCache(res, 120);
    const clientes = await dbAll(`
      SELECT 
        c.id, 
        c.nome, 
        c.primeiro_pedido, 
        c.ultimo_pedido,
        c.data_criacao,
        (SELECT COUNT(*) FROM fichas WHERE fichas.cliente = c.nome) as total_pedidos
      FROM clientes c
      ORDER BY c.nome ASC
    `);

    res.json(clientes);
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// Atualizar cliente
app.put('/api/clientes/:id', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID do cliente inválido');
    if (!paramsData) return;

    const bodyData = parseWithZod(res, clienteUpdateBodySchema, req.body, 'Dados do cliente inválidos');
    if (!bodyData) return;

    const id = paramsData.id;
    const { nome, primeiro_pedido, ultimo_pedido } = bodyData;
    const nomeNormalizado = normalizeNameCase(nome || '');

    const clienteExiste = await dbGet('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!clienteExiste) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    if (nomeNormalizado && nomeNormalizado.toLowerCase() !== (clienteExiste.nome || '').toLowerCase()) {
      const nomeExiste = await dbGet(
        'SELECT id FROM clientes WHERE lower(nome) = lower(?) AND id != ?',
        [nomeNormalizado, id]
      );
      if (nomeExiste) {
        return res.status(400).json({ error: 'Já existe um cliente com este nome' });
      }
    }

    const nomeFinal = nomeNormalizado || clienteExiste.nome;

    await dbRun(
      `UPDATE clientes SET nome = ?, primeiro_pedido = ?, ultimo_pedido = ? WHERE id = ?`,
      [nomeFinal, primeiro_pedido, ultimo_pedido, id]
    );

    if (nomeFinal !== clienteExiste.nome) {
      await dbRun(
        `UPDATE fichas SET cliente = ? WHERE lower(cliente) = lower(?)`,
        [nomeFinal, clienteExiste.nome]
      );
      console.log(`[clientes] Nome atualizado nas fichas: "${clienteExiste.nome}" -> "${nomeFinal}"`);
    }

    await addSystemLog({
      eventType: 'cliente_editado',
      action: 'Cliente editado',
      details: {
        cliente: nomeFinal,
        de: clienteExiste.nome,
        para: nomeFinal,
        primeiroPedido: primeiro_pedido || clienteExiste.primeiro_pedido || '',
        ultimoPedido: ultimo_pedido || clienteExiste.ultimo_pedido || ''
      }
    });

    console.log(`[clientes] Cliente #${id} atualizado`);
    res.json({ message: 'Cliente atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// Deletar cliente
app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID do cliente inválido');
    if (!paramsData) return;

    const { id } = paramsData;

    const clienteExiste = await dbGet('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!clienteExiste) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    await dbRun('DELETE FROM clientes WHERE id = ?', [id]);

    await addSystemLog({
      eventType: 'cliente_deletado',
      action: 'Cliente deletado',
      details: {
        cliente: clienteExiste.nome || '',
        clienteId: id
      }
    });

    console.log(`[clientes] Cliente #${id} (${clienteExiste.nome}) deletado`);
    res.json({ message: 'Cliente excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar cliente:', error);
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

app.get('/api/relatorio-clientes', async (req, res) => {
  try {
    setShortCdnCache(res, 60);
    const queryData = parseWithZod(res, relatorioClientesListQuerySchema, req.query, 'Parâmetros de relatório de clientes inválidos');
    if (!queryData) return;

    const limit = Number(queryData.limit) || 30;
    const offset = Number(queryData.offset) || 0;
    const termo = String(queryData.query || '').trim();

    let rows = [];
    let total = 0;

    if (!termo) {
      const totalRow = await dbGet('SELECT COUNT(*) as total FROM clientes');
      total = Number(totalRow?.total || 0);

      rows = await dbAll(
        `
        SELECT
          c.id,
          c.nome,
          c.primeiro_pedido,
          c.ultimo_pedido,
          c.total_pedidos
        FROM clientes c
        ORDER BY c.ultimo_pedido DESC, c.nome ASC
        LIMIT ? OFFSET ?
        `,
        [limit, offset]
      );
    } else {
      const termoNormalizado = normalizarTextoBusca(termo);
      const allRows = await dbAll(
        `
        SELECT
          c.id,
          c.nome,
          c.primeiro_pedido,
          c.ultimo_pedido,
          c.total_pedidos
        FROM clientes c
        ORDER BY c.ultimo_pedido DESC, c.nome ASC
        `
      );

      const filtrados = allRows.filter(item => (
        normalizarTextoBusca(item?.nome || '').includes(termoNormalizado)
      ));

      total = filtrados.length;
      rows = filtrados.slice(offset, offset + limit);
    }

    res.json({
      items: rows.map(item => ({
        id: item.id,
        nome: item.nome,
        documento: null,
        email: null,
        primeiroPedido: item.primeiro_pedido || null,
        ultimoPedido: item.ultimo_pedido || null,
        totalPedidos: Number(item.total_pedidos || 0)
      })),
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total
    });
  } catch (error) {
    console.error('Erro ao listar clientes para relatório:', error);
    res.status(500).json({ error: 'Erro ao listar clientes para relatório' });
  }
});

app.get('/api/relatorio-clientes/:id', async (req, res) => {
  try {
    setShortCdnCache(res, 60);
    const paramsData = parseWithZod(res, positiveIdParamSchema, req.params, 'ID do cliente inválido');
    if (!paramsData) return;
    const queryData = parseWithZod(res, relatorioClienteDetalheQuerySchema, req.query, 'Parâmetros de período inválidos');
    if (!queryData) return;

    const cliente = await dbGet(
      'SELECT id, nome, primeiro_pedido, ultimo_pedido, total_pedidos FROM clientes WHERE id = ?',
      [paramsData.id]
    );
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const fichasLimit = Number(queryData.fichasLimit) || 10;
    const fichasOffset = Number(queryData.fichasOffset) || 0;
    const where = ['lower(cliente) = lower(?)'];
    const args = [cliente.nome];

    if (queryData.dataInicio && queryData.dataFim) {
      where.push('data_inicio BETWEEN ? AND ?');
      args.push(queryData.dataInicio, queryData.dataFim);
    }
    const whereSql = where.join(' AND ');

    const totalRow = await dbGet(
      `SELECT COUNT(*) as total FROM fichas WHERE ${whereSql}`,
      args
    );
    const totalFichas = Number(totalRow?.total || 0);

    const fichasPeriodo = await dbAll(
      `
      SELECT id, numero_venda, status, data_inicio, data_entrega, produtos, observacoes
      FROM fichas
      WHERE ${whereSql}
      ORDER BY data_inicio DESC, id DESC
      `,
      args
    );

    const topProdutosMap = new Map();
    let totalItens = 0;
    let primeiroPedidoPeriodo = null;
    let ultimoPedidoPeriodo = null;
    const historicoResumo = [];

    fichasPeriodo.forEach(f => {
      const data = String(f.data_inicio || '').trim();
      if (data) {
        if (!primeiroPedidoPeriodo || data < primeiroPedidoPeriodo) primeiroPedidoPeriodo = data;
        if (!ultimoPedidoPeriodo || data > ultimoPedidoPeriodo) ultimoPedidoPeriodo = data;
      }

      let itensFicha = 0;
      const produtosRaw = f.produtos;
      if (produtosRaw) {
        try {
          const produtos = typeof produtosRaw === 'string' ? JSON.parse(produtosRaw) : produtosRaw;
          if (Array.isArray(produtos)) {
            produtos.forEach(p => {
              const nome = String(p?.produto || p?.descricao || '').trim() || 'Sem produto';
              const qtd = Number.parseInt(String(p?.quantidade || '0'), 10) || 0;
              itensFicha += qtd;
              totalItens += qtd;
              if (!topProdutosMap.has(nome)) {
                topProdutosMap.set(nome, { produto: nome, quantidade: 0, pedidosSet: new Set() });
              }
              const entry = topProdutosMap.get(nome);
              entry.quantidade += qtd;
              entry.pedidosSet.add(f.id);
            });
          }
        } catch (_) {}
      }

      historicoResumo.push({
        id: f.id,
        numeroVenda: f.numero_venda || '',
        status: f.status || '',
        dataInicio: f.data_inicio || '',
        dataEntrega: f.data_entrega || '',
        resumo: `${itensFicha} item(ns)`,
        itens: itensFicha
      });
    });

    const topProdutos = Array.from(topProdutosMap.values())
      .map(item => ({
        produto: item.produto,
        quantidade: item.quantidade,
        pedidos: item.pedidosSet.size
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const datasOrdenadas = fichasPeriodo
      .map(f => String(f.data_inicio || '').trim())
      .filter(Boolean)
      .sort();
    let mediaDiasEntreCompras = null;
    if (datasOrdenadas.length >= 2) {
      let somaDias = 0;
      for (let i = 1; i < datasOrdenadas.length; i += 1) {
        const d1 = new Date(`${datasOrdenadas[i - 1]}T00:00:00`);
        const d2 = new Date(`${datasOrdenadas[i]}T00:00:00`);
        const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
        if (Number.isFinite(diff) && diff >= 0) somaDias += diff;
      }
      mediaDiasEntreCompras = Math.round(somaDias / Math.max(datasOrdenadas.length - 1, 1));
    }

    const periodoInicio = queryData.dataInicio || null;
    const periodoFim = queryData.dataFim || null;
    const pedidosNoPeriodo = totalFichas;
    const mesesNoPeriodo = (() => {
      if (!periodoInicio || !periodoFim) return null;
      const inicio = new Date(`${periodoInicio}T00:00:00`);
      const fim = new Date(`${periodoFim}T00:00:00`);
      const diffMeses = ((fim.getFullYear() - inicio.getFullYear()) * 12) + (fim.getMonth() - inicio.getMonth()) + 1;
      return Math.max(diffMeses, 1);
    })();
    const pedidosPorMes = mesesNoPeriodo ? Number((pedidosNoPeriodo / mesesNoPeriodo).toFixed(2)) : null;

    const recorrentes = topProdutos
      .filter(p => p.pedidos >= 2)
      .slice(0, 5)
      .map(p => ({ produto: p.produto, pedidos: p.pedidos, quantidade: p.quantidade }));

    const alertas = [];
    const ultimoGlobal = String(cliente.ultimo_pedido || '').trim();
    if (ultimoGlobal) {
      const diff = Math.floor((Date.now() - new Date(`${ultimoGlobal}T00:00:00`).getTime()) / 86400000);
      if (Number.isFinite(diff) && diff > 90) {
        alertas.push(`Cliente inativo há ${diff} dias`);
      }
    }

    res.json({
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        primeiroPedido: cliente.primeiro_pedido || null,
        ultimoPedido: cliente.ultimo_pedido || null,
        totalPedidos: Number(cliente.total_pedidos || 0)
      },
      periodo: {
        dataInicio: periodoInicio,
        dataFim: periodoFim
      },
      kpis: {
        quantidadePedidos: pedidosNoPeriodo,
        primeiroPedido: primeiroPedidoPeriodo,
        ultimoPedido: ultimoPedidoPeriodo,
        totalItens
      },
      topProdutos,
      totais: {
        itens: totalItens,
        pedidos: pedidosNoPeriodo
      },
      insights: {
        categoriasPreferidas: topProdutos.slice(0, 3).map(p => p.produto),
        frequenciaCompra: {
          pedidosPorMes,
          mediaDiasEntreCompras
        },
        produtosRecorrentes: recorrentes,
        alertas
      },
      historico: {
        items: historicoResumo.slice(fichasOffset, fichasOffset + fichasLimit),
        total: totalFichas,
        limit: fichasLimit,
        offset: fichasOffset,
        hasMore: fichasOffset + fichasLimit < totalFichas
      }
    });
  } catch (error) {
    console.error('Erro ao carregar relatório detalhado do cliente:', error);
    res.status(500).json({ error: 'Erro ao carregar relatório detalhado do cliente' });
  }
});

// Estatísticas gerais
app.get('/api/estatisticas', async (req, res) => {
  try {
    setShortCdnCache(res, 60);
    const stats = {};

    const totalFichas = await dbGet('SELECT COUNT(*) as total FROM fichas');
    stats.totalFichas = totalFichas?.total || 0;

    const pendentes = await dbGet("SELECT COUNT(*) as total FROM fichas WHERE status = 'pendente'");
    stats.pendentes = pendentes?.total || 0;

    const entregues = await dbGet("SELECT COUNT(*) as total FROM fichas WHERE status = 'entregue'");
    stats.entregues = entregues?.total || 0;

    const totalClientes = await dbGet('SELECT COUNT(*) as total FROM clientes');
    stats.totalClientes = totalClientes?.total || 0;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const esteMes = await dbGet(
      "SELECT COUNT(*) as total FROM fichas WHERE substr(data_inicio, 1, 7) = ?",
      [mesAtual]
    );
    stats.esteMes = esteMes?.total || 0;

    const fichas = await dbAll('SELECT produtos FROM fichas');
    let totalItens = 0;
    fichas.forEach(ficha => {
      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            totalItens += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });
    stats.totalItens = totalItens;

    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// ==================== ROTAS CLOUDINARY ====================

// Obter configuração pública do Cloudinary
app.get('/api/cloudinary/config', (req, res) => {
  setShortCdnCache(res, 3600);
  res.json({
    cloudName: CLOUDINARY_CONFIG.cloudName,
    apiKey: CLOUDINARY_CONFIG.apiKey,
    uploadPreset: CLOUDINARY_CONFIG.uploadPreset
  });
});

// Gerar assinatura para upload signed
app.post('/api/cloudinary/signature', (req, res) => {
  try {
    const bodyData = parseWithZod(res, cloudinarySignatureBodySchema, req.body, 'Parâmetros de assinatura inválidos');
    if (!bodyData) return;

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'fichas';
    const transformation = 'c_limit,w_1500,h_1500,q_auto:good';

    const paramsToSign = {
      timestamp,
      folder,
      transformation,
      ...bodyData
    };

    Object.keys(paramsToSign).forEach(key => {
      if (paramsToSign[key] === undefined || paramsToSign[key] === '') {
        delete paramsToSign[key];
      }
    });

    const signature = generateCloudinarySignature(paramsToSign);

    res.json({
      signature,
      timestamp,
      folder,
      transformation,
      apiKey: CLOUDINARY_CONFIG.apiKey,
      cloudName: CLOUDINARY_CONFIG.cloudName
    });
  } catch (error) {
    console.error('Erro ao gerar assinatura:', error);
    res.status(500).json({ error: 'Erro ao gerar assinatura' });
  }
});

// Migração - converter base64 para Cloudinary
app.post('/api/cloudinary/migrar', async (req, res) => {
  try {
    const fichas = await dbAll(`
      SELECT id, imagem_data, imagens_data 
      FROM fichas 
      WHERE (imagem_data IS NOT NULL AND imagem_data LIKE 'data:%')
         OR (imagens_data IS NOT NULL AND imagens_data LIKE '%data:%')
    `);

    console.log(`[cloudinary:migracao] Encontradas ${fichas.length} fichas com imagens para migrar`);

    const resultados = {
      total: fichas.length,
      migradas: 0,
      erros: [],
      detalhes: []
    };

    for (const ficha of fichas) {
      try {
        let imagensAtualizadas = [];
        let temAlteracao = false;

        if (ficha.imagens_data) {
          let imagens = [];
          try {
            imagens = JSON.parse(ficha.imagens_data);
          } catch (e) {
            console.warn(`Ficha #${ficha.id}: erro ao parsear imagens_data`);
          }

          for (const img of imagens) {
            if (img.src && img.src.startsWith('data:')) {
              const uploadResult = await uploadBase64ToCloudinary(img.src, `ficha_${ficha.id}`);
              if (uploadResult.success) {
                imagensAtualizadas.push({
                  src: uploadResult.url,
                  publicId: uploadResult.publicId,
                  descricao: img.descricao || ''
                });
                temAlteracao = true;
              } else {
                imagensAtualizadas.push(img);
                resultados.erros.push(`Ficha #${ficha.id}: ${uploadResult.error}`);
              }
            } else {
              imagensAtualizadas.push(img);
            }
          }
        }

        if (ficha.imagem_data && ficha.imagem_data.startsWith('data:') && imagensAtualizadas.length === 0) {
          const uploadResult = await uploadBase64ToCloudinary(ficha.imagem_data, `ficha_${ficha.id}`);
          if (uploadResult.success) {
            imagensAtualizadas.push({
              src: uploadResult.url,
              publicId: uploadResult.publicId,
              descricao: ''
            });
            temAlteracao = true;
          } else {
            resultados.erros.push(`Ficha #${ficha.id}: ${uploadResult.error}`);
          }
        }

        if (temAlteracao && imagensAtualizadas.length > 0) {
          await dbRun(
            `UPDATE fichas SET imagens_data = ?, imagem_data = NULL WHERE id = ?`,
            [JSON.stringify(imagensAtualizadas), ficha.id]
          );
          resultados.migradas++;
          resultados.detalhes.push({
            fichaId: ficha.id,
            imagensMigradas: imagensAtualizadas.length
          });
          console.log(`[cloudinary:migracao] Ficha #${ficha.id}: ${imagensAtualizadas.length} imagem(ns) migrada(s)`);
        }

      } catch (err) {
        console.error(`[cloudinary:migracao] Erro na ficha #${ficha.id}:`, err);
        resultados.erros.push(`Ficha #${ficha.id}: ${err.message}`);
      }
    }

    console.log(`[cloudinary:migracao] Concluída: ${resultados.migradas}/${resultados.total} fichas`);
    res.json(resultados);

  } catch (error) {
    console.error('Erro na migração:', error);
    res.status(500).json({ error: 'Erro ao executar migração' });
  }
});

// Função auxiliar para upload de base64 para Cloudinary
async function uploadBase64ToCloudinary(base64Data, publicIdPrefix) {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'fichas';
    const publicId = `${publicIdPrefix}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    const transformation = 'c_limit,w_1500,h_1500,q_auto:good';

    const paramsToSign = {
      timestamp,
      folder,
      public_id: publicId,
      transformation
    };

    const signature = generateCloudinarySignature(paramsToSign);

    const formData = new URLSearchParams();
    formData.append('file', base64Data);
    formData.append('timestamp', timestamp);
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    formData.append('signature', signature);
    formData.append('api_key', CLOUDINARY_CONFIG.apiKey);
    formData.append('transformation', transformation);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload falhou: ${errorText}`);
    }

    const result = await response.json();

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    };

  } catch (error) {
    console.error('Erro no upload Cloudinary:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Deletar imagem do Cloudinary
app.delete('/api/cloudinary/image/:publicId', async (req, res) => {
  try {
    const paramsData = parseWithZod(res, cloudinaryDeleteParamsSchema, req.params, 'Parâmetros de imagem inválidos');
    if (!paramsData) return;
    const queryData = parseWithZod(res, cloudinaryDeleteQuerySchema, req.query, 'Parâmetros de exclusão inválidos');
    if (!queryData) return;

    const { publicId } = paramsData;
    const excludeFichaId = queryData.excludeFichaId || null;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const realPublicId = publicId.replace(/_SLASH_/g, '/');

    const candidatas = await dbAll(
      'SELECT id, imagens_data FROM fichas WHERE imagens_data IS NOT NULL AND imagens_data LIKE ?',
      [`%${realPublicId}%`]
    );

    const emUsoEmOutraFicha = candidatas.some(ficha => {
      if (excludeFichaId && Number(ficha.id) === excludeFichaId) return false;
      try {
        const imagens = JSON.parse(ficha.imagens_data || '[]');
        if (!Array.isArray(imagens)) return false;
        return imagens.some(img => img && img.publicId === realPublicId);
      } catch {
        return false;
      }
    });

    if (emUsoEmOutraFicha) {
      return res.json({
        success: true,
        shared: true,
        message: 'Imagem compartilhada. Apenas a referência local foi removida.'
      });
    }

    const paramsToSign = {
      public_id: realPublicId,
      timestamp
    };

    const signature = generateCloudinarySignature(paramsToSign);

    const formData = new URLSearchParams();
    formData.append('public_id', realPublicId);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('api_key', CLOUDINARY_CONFIG.apiKey);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/destroy`,
      {
        method: 'POST',
        body: formData
      }
    );

    const result = await response.json();

    if (result.result === 'ok') {
      console.log(`[cloudinary] Imagem deletada: ${realPublicId}`);
      res.json({ success: true });
    } else if (result.result === 'not found') {
      res.json({
        success: true,
        notFound: true,
        message: 'Imagem já não existia no Cloudinary.'
      });
    } else {
      res.status(400).json({ error: 'Falha ao deletar imagem', details: result });
    }

  } catch (error) {
    console.error('Erro ao deletar imagem:', error);
    res.status(500).json({ error: 'Erro ao deletar imagem' });
  }
});

// Função auxiliar para atualizar dados do cliente
async function atualizarCliente(nomeCliente, dataInicio) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const data = dataInicio || hoje;
    const nomeNormalizado = normalizeNameCase(nomeCliente);
    if (!nomeNormalizado) return;

    const clienteExiste = await dbGet('SELECT * FROM clientes WHERE lower(nome) = lower(?)', [nomeNormalizado]);

    if (clienteExiste) {
      await dbRun(
        `UPDATE clientes SET nome = ?, ultimo_pedido = ?, total_pedidos = total_pedidos + 1 WHERE id = ?`,
        [nomeNormalizado, data, clienteExiste.id]
      );
    } else {
      await dbRun(
        `INSERT INTO clientes (nome, primeiro_pedido, ultimo_pedido, total_pedidos) VALUES (?, ?, ?, 1)`,
        [nomeNormalizado, data, data]
      );

      await addSystemLog({
        eventType: 'cliente_adicionado',
        action: 'Cliente adicionado',
        details: {
          cliente: nomeNormalizado,
          primeiroPedido: data
        }
      });
    }
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
  }
}

// ==================== ROTAS DE RELATÓRIO DETALHADO ====================

function obterReferenciaPeriodoRelatorio(now = new Date()) {
  const anoAtual = String(now.getFullYear());
  const mesAtual = `${anoAtual}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dataMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const anoMesAnterior = String(dataMesAnterior.getFullYear());
  const mesAnterior = `${anoMesAnterior}-${String(dataMesAnterior.getMonth() + 1).padStart(2, '0')}`;
  return {
    anoAtual,
    mesAtual,
    mesAnterior
  };
}

function adicionarFiltrosRelatorio(whereParts, params, queryData, campoDataExpr) {
  const cliente = String(queryData?.cliente || '').trim();
  const clienteDataInicio = queryData?.clienteDataInicio;
  const clienteDataFim = queryData?.clienteDataFim;
  const periodo = String(queryData?.periodo || '').toLowerCase();
  const dataInicio = queryData?.dataInicio;
  const dataFim = queryData?.dataFim;

  if (cliente) {
    whereParts.push('lower(cliente) = lower(?)');
    params.push(cliente);
  }

  if (cliente && clienteDataInicio && clienteDataFim) {
    whereParts.push(`${campoDataExpr} BETWEEN ? AND ?`);
    params.push(clienteDataInicio, clienteDataFim);
    return;
  }

  // Com cliente selecionado sem datas próprias, ignora o período padrão (ex.: "Este mês").
  if (cliente) return;

  const { anoAtual, mesAtual, mesAnterior } = obterReferenciaPeriodoRelatorio(new Date());
  if (periodo === 'mes') {
    whereParts.push(`substr(${campoDataExpr}, 1, 7) = ?`);
    params.push(mesAtual);
  } else if (periodo === 'ultimo_mes') {
    whereParts.push(`substr(${campoDataExpr}, 1, 7) = ?`);
    params.push(mesAnterior);
  } else if (periodo === 'ano') {
    whereParts.push(`substr(${campoDataExpr}, 1, 4) = ?`);
    params.push(anoAtual);
  } else if (periodo === 'customizado' && dataInicio && dataFim) {
    whereParts.push(`${campoDataExpr} BETWEEN ? AND ?`);
    params.push(dataInicio, dataFim);
  }
}

// Relatório principal (ÚNICA definição - usa data_entregue para entregues, data_inicio para pendentes)
app.get('/api/relatorio', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const { periodo } = queryData;

    const relatorio = {};

    // ---- Fichas entregues (filtradas por data_entregue) ----
    const whereEntregues = ["status = 'entregue'"];
    const paramsEntregues = [];
    adicionarFiltrosRelatorio(whereEntregues, paramsEntregues, queryData, 'date(data_entregue)');
    const sqlEntregues = `SELECT COUNT(*) as total FROM fichas WHERE ${whereEntregues.join(' AND ')}`;

    const entreguesResult = await dbGet(sqlEntregues, paramsEntregues);
    relatorio.fichasEntregues = entreguesResult?.total || 0;

    // ---- Fichas pendentes (filtradas por data_inicio) ----
    const wherePendentes = ["status = 'pendente'"];
    const paramsPendentes = [];
    adicionarFiltrosRelatorio(wherePendentes, paramsPendentes, queryData, 'data_inicio');
    const sqlPendentes = `SELECT COUNT(*) as total FROM fichas WHERE ${wherePendentes.join(' AND ')}`;

    const pendentesResult = await dbGet(sqlPendentes, paramsPendentes);
    relatorio.fichasPendentes = pendentesResult?.total || 0;

    // ---- Itens confeccionados (entregues, filtrados por data_entregue) ----
    const whereItens = ["status = 'entregue'"];
    const paramsItens = [];
    adicionarFiltrosRelatorio(whereItens, paramsItens, queryData, 'date(data_entregue)');
    const sqlItens = `SELECT produtos FROM fichas WHERE ${whereItens.join(' AND ')}`;

    const fichasParaItens = await dbAll(sqlItens, paramsItens);

    let itensConfeccionados = 0;
    fichasParaItens.forEach(ficha => {
      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            itensConfeccionados += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });
    relatorio.itensConfeccionados = itensConfeccionados;

    // ---- Novos clientes ----
    // Para "novos clientes", quando há filtro por cliente específico o valor é forçado para 0.
    let sqlClientes = '';
    let paramsClientes = [];
    if (String(queryData?.cliente || '').trim()) {
      sqlClientes = 'SELECT 0 as total';
    } else if (periodo === 'mes') {
      const { mesAtual } = obterReferenciaPeriodoRelatorio(new Date());
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE substr(primeiro_pedido, 1, 7) = ?`;
      paramsClientes = [mesAtual];
    } else if (periodo === 'ultimo_mes') {
      const { mesAnterior } = obterReferenciaPeriodoRelatorio(new Date());
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE substr(primeiro_pedido, 1, 7) = ?`;
      paramsClientes = [mesAnterior];
    } else if (periodo === 'ano') {
      const { anoAtual } = obterReferenciaPeriodoRelatorio(new Date());
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE substr(primeiro_pedido, 1, 4) = ?`;
      paramsClientes = [anoAtual];
    } else if (periodo === 'customizado' && queryData.dataInicio && queryData.dataFim) {
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE primeiro_pedido BETWEEN ? AND ?`;
      paramsClientes = [queryData.dataInicio, queryData.dataFim];
    } else {
      sqlClientes = `SELECT COUNT(*) as total FROM clientes`;
    }

    const clientesResult = await dbGet(sqlClientes, paramsClientes);
    relatorio.novosClientes = clientesResult?.total || 0;

    // ---- Top vendedor ----
    const whereVendedor = ["vendedor IS NOT NULL", "vendedor != ''"];
    const paramsVendedor = [];
    adicionarFiltrosRelatorio(whereVendedor, paramsVendedor, queryData, 'data_inicio');
    const sqlVendedor = `SELECT vendedor, COUNT(*) as total FROM fichas WHERE ${whereVendedor.join(' AND ')} GROUP BY vendedor ORDER BY total DESC LIMIT 1`;

    const topVendedor = await dbGet(sqlVendedor, paramsVendedor);
    relatorio.topVendedor = topVendedor ? topVendedor.vendedor : null;
    relatorio.topVendedorTotal = topVendedor ? topVendedor.total : 0;

    // Calcular totalFichas como soma segura
    const totalFichas = relatorio.fichasEntregues + relatorio.fichasPendentes;

    console.log('[relatorio] Gerado:', relatorio);
    res.json({
      totalFichas,
      fichasEntregues: relatorio.fichasEntregues,
      fichasPendentes: relatorio.fichasPendentes,
      itensConfeccionados: relatorio.itensConfeccionados,
      novosClientes: relatorio.novosClientes,
      topVendedor: relatorio.topVendedor,
      topVendedorTotal: relatorio.topVendedorTotal
    });

  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// Análise por vendedor (usa data_inicio para total de pedidos, data_entregue para entregues)
app.get('/api/relatorio/vendedores', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const { periodo } = queryData;

    // Filtro por data_inicio para pedidos totais
    const whereParts = ["vendedor IS NOT NULL", "vendedor != ''"];
    const params = [];
    adicionarFiltrosRelatorio(whereParts, params, queryData, 'data_inicio');
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    // Buscar todas as fichas com vendedor (total de pedidos)
    const fichas = await dbAll(`SELECT vendedor, produtos, status, data_entregue FROM fichas ${whereClause}`, params);

    // Filtro por data_entregue para contar entregues no período
    const whereEntregueParts = ["vendedor IS NOT NULL", "vendedor != ''", "status = 'entregue'", "data_entregue IS NOT NULL"];
    const paramsEntregue = [];
    adicionarFiltrosRelatorio(whereEntregueParts, paramsEntregue, queryData, 'date(data_entregue)');
    const whereEntregue = `WHERE ${whereEntregueParts.join(' AND ')}`;

    // Buscar fichas entregues no período pela data de entrega
    const fichasEntregues = await dbAll(`SELECT vendedor FROM fichas ${whereEntregue}`, paramsEntregue);

    // Contar entregues por vendedor (pela data_entregue)
    const entreguesPorVendedor = {};
    fichasEntregues.forEach(ficha => {
      if (!entreguesPorVendedor[ficha.vendedor]) {
        entreguesPorVendedor[ficha.vendedor] = 0;
      }
      entreguesPorVendedor[ficha.vendedor]++;
    });

    // Agrupar por vendedor (pedidos totais pela data_inicio)
    const vendedoresMap = {};
    fichas.forEach(ficha => {
      if (!vendedoresMap[ficha.vendedor]) {
        vendedoresMap[ficha.vendedor] = { total_pedidos: 0, total_itens: 0, entregues: 0 };
      }
      vendedoresMap[ficha.vendedor].total_pedidos++;

      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            vendedoresMap[ficha.vendedor].total_itens += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });

    // Atribuir entregues pela data_entregue
    Object.keys(vendedoresMap).forEach(vendedor => {
      vendedoresMap[vendedor].entregues = entreguesPorVendedor[vendedor] || 0;
    });

    const resultado = Object.entries(vendedoresMap)
      .map(([vendedor, dados]) => ({
        vendedor,
        total_pedidos: dados.total_pedidos,
        total_itens: dados.total_itens,
        entregues: Math.min(dados.entregues, dados.total_pedidos)
      }))
      .sort((a, b) => b.total_itens - a.total_itens);

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar vendedores:', error);
    res.status(500).json({ error: 'Erro ao buscar análise por vendedor' });
  }
});

// Análise por material
app.get('/api/relatorio/materiais', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const whereParts = ["material IS NOT NULL", "material != ''"];
    const params = [];
    adicionarFiltrosRelatorio(whereParts, params, queryData, 'data_inicio');
    const fichas = await dbAll(`SELECT material, produtos FROM fichas WHERE ${whereParts.join(' AND ')}`, params);

    // Agrupar por material
    const materiaisMap = {};
    fichas.forEach(ficha => {
      if (!materiaisMap[ficha.material]) {
        materiaisMap[ficha.material] = { total_pedidos: 0, total_itens: 0 };
      }
      materiaisMap[ficha.material].total_pedidos++;

      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            materiaisMap[ficha.material].total_itens += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });

    const resultado = Object.entries(materiaisMap)
      .map(([material, dados]) => ({
        material,
        total_pedidos: dados.total_pedidos,
        total_itens: dados.total_itens
      }))
      .sort((a, b) => b.total_itens - a.total_itens);

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar materiais:', error);
    res.status(500).json({ error: 'Erro ao buscar análise por material' });
  }
});

// Top produtos (descrições)
app.get('/api/relatorio/produtos', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const whereParts = [];
    const params = [];
    adicionarFiltrosRelatorio(whereParts, params, queryData, 'data_inicio');
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const fichas = await dbAll(`SELECT produtos FROM fichas ${whereClause}`, params);

    // Contar produtos pelo nome principal (com fallback retrocompatível)
    const produtosMap = {};
    fichas.forEach(ficha => {
      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            const produtoNome = String(p.produto || p.descricao || '').trim() || 'Sem produto';
            if (!produtosMap[produtoNome]) {
              produtosMap[produtoNome] = 0;
            }
            produtosMap[produtoNome] += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });

    const resultado = Object.entries(produtosMap)
      .map(([produto, quantidade]) => ({ produto, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10);

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar top produtos' });
  }
});

// Top clientes
app.get('/api/relatorio/clientes-top', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const whereParts = ["cliente IS NOT NULL", "cliente != ''"];
    const params = [];
    adicionarFiltrosRelatorio(whereParts, params, queryData, 'data_inicio');
    const fichas = await dbAll(`SELECT cliente, numero_venda, produtos FROM fichas WHERE ${whereParts.join(' AND ')}`, params);

    // Agrupar por cliente
    const clientesMap = {};
    fichas.forEach(ficha => {
      if (!clientesMap[ficha.cliente]) {
        clientesMap[ficha.cliente] = { total_pedidos: 0, total_itens: 0, numeroVendasContados: new Set() };
      }

      const numeroVendaNormalizado = typeof ficha.numero_venda === 'string'
        ? ficha.numero_venda.trim()
        : '';

      // Se numero_venda existir, conta apenas uma vez por cliente.
      // Se estiver vazio/nulo, mantém contagem por ficha.
      if (numeroVendaNormalizado) {
        if (!clientesMap[ficha.cliente].numeroVendasContados.has(numeroVendaNormalizado)) {
          clientesMap[ficha.cliente].numeroVendasContados.add(numeroVendaNormalizado);
          clientesMap[ficha.cliente].total_pedidos++;
        }
      } else {
        clientesMap[ficha.cliente].total_pedidos++;
      }

      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            clientesMap[ficha.cliente].total_itens += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });

    const resultado = Object.entries(clientesMap)
      .map(([cliente, dados]) => ({
        cliente,
        total_pedidos: dados.total_pedidos,
        total_itens: dados.total_itens
      }))
      .sort((a, b) => b.total_itens - a.total_itens)
      .slice(0, 10);

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    res.status(500).json({ error: 'Erro ao buscar top clientes' });
  }
});

// Distribuição por tamanho
app.get('/api/relatorio/tamanhos', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const whereParts = [];
    const params = [];
    adicionarFiltrosRelatorio(whereParts, params, queryData, 'data_inicio');
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const fichas = await dbAll(`SELECT produtos FROM fichas ${whereClause}`, params);

    // Contar por tamanho
    const tamanhosMap = {};
    fichas.forEach(ficha => {
      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            const tam = (p.tamanho || 'N/A').toUpperCase().trim();
            if (!tamanhosMap[tam]) {
              tamanhosMap[tam] = 0;
            }
            tamanhosMap[tam] += parseInt(p.quantidade) || 0;
          });
        } catch (e) {}
      }
    });

    // Ordenar por ordem comum de tamanhos
    const ordemTamanhos = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG', 'XXXG', 'EG', 'EGG', '2', '4', '6', '8', '10', '12', '14', '16'];

    const resultado = Object.entries(tamanhosMap)
      .map(([tamanho, quantidade]) => ({ tamanho, quantidade }))
      .sort((a, b) => {
        const idxA = ordemTamanhos.indexOf(a.tamanho);
        const idxB = ordemTamanhos.indexOf(b.tamanho);
        if (idxA === -1 && idxB === -1) return a.tamanho.localeCompare(b.tamanho);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar tamanhos:', error);
    res.status(500).json({ error: 'Erro ao buscar distribuição por tamanho' });
  }
});

// Comparativo com período anterior
app.get('/api/relatorio/comparativo', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const { periodo, dataInicio, dataFim } = queryData;
    const cliente = String(queryData?.cliente || '').trim();
    const clienteDataInicio = queryData?.clienteDataInicio;
    const clienteDataFim = queryData?.clienteDataFim;
    const now = new Date();
    let atual = { inicio: '', fim: '' };
    let anterior = { inicio: '', fim: '' };

    if (cliente && clienteDataInicio && clienteDataFim) {
      const inicio = new Date(clienteDataInicio);
      const fim = new Date(clienteDataFim);
      const diff = fim - inicio;
      atual.inicio = clienteDataInicio;
      atual.fim = clienteDataFim;

      const anteriorFim = new Date(inicio);
      anteriorFim.setDate(anteriorFim.getDate() - 1);
      const anteriorInicio = new Date(anteriorFim);
      anteriorInicio.setTime(anteriorInicio.getTime() - diff);
      anterior.inicio = anteriorInicio.toISOString().split('T')[0];
      anterior.fim = anteriorFim.toISOString().split('T')[0];
    } else if (cliente) {
      // Com cliente sem datas próprias, ignora o "Este mês" e usa janela móvel de 30 dias.
      const hoje = now.toISOString().split('T')[0];
      const trintaDiasAtras = new Date(now);
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
      const sessentaDiasAtras = new Date(now);
      sessentaDiasAtras.setDate(sessentaDiasAtras.getDate() - 60);

      atual.inicio = trintaDiasAtras.toISOString().split('T')[0];
      atual.fim = hoje;
      anterior.inicio = sessentaDiasAtras.toISOString().split('T')[0];
      anterior.fim = trintaDiasAtras.toISOString().split('T')[0];
    } else if (periodo === 'mes') {
      const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mesAnterior = now.getMonth() === 0 
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

      atual.inicio = `${mesAtual}-01`;
      atual.fim = `${mesAtual}-31`;
      anterior.inicio = `${mesAnterior}-01`;
      anterior.fim = `${mesAnterior}-31`;
    } else if (periodo === 'ultimo_mes') {
      const dataMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const dataMesRetrasado = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const ultimoDiaMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0);
      const ultimoDiaMesRetrasado = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      atual.inicio = `${dataMesAnterior.getFullYear()}-${String(dataMesAnterior.getMonth() + 1).padStart(2, '0')}-01`;
      atual.fim = ultimoDiaMesAnterior.toISOString().split('T')[0];
      anterior.inicio = `${dataMesRetrasado.getFullYear()}-${String(dataMesRetrasado.getMonth() + 1).padStart(2, '0')}-01`;
      anterior.fim = ultimoDiaMesRetrasado.toISOString().split('T')[0];
    } else if (periodo === 'ano') {
      atual.inicio = `${now.getFullYear()}-01-01`;
      atual.fim = `${now.getFullYear()}-12-31`;
      anterior.inicio = `${now.getFullYear() - 1}-01-01`;
      anterior.fim = `${now.getFullYear() - 1}-12-31`;
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      const diff = fim - inicio;

      atual.inicio = dataInicio;
      atual.fim = dataFim;

      const anteriorFim = new Date(inicio);
      anteriorFim.setDate(anteriorFim.getDate() - 1);
      const anteriorInicio = new Date(anteriorFim);
      anteriorInicio.setTime(anteriorInicio.getTime() - diff);

      anterior.inicio = anteriorInicio.toISOString().split('T')[0];
      anterior.fim = anteriorFim.toISOString().split('T')[0];
    } else {
      // Geral: comparar últimos 30 dias com 30 dias anteriores
      const hoje = now.toISOString().split('T')[0];
      const trintaDiasAtras = new Date(now);
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
      const sessentaDiasAtras = new Date(now);
      sessentaDiasAtras.setDate(sessentaDiasAtras.getDate() - 60);

      atual.inicio = trintaDiasAtras.toISOString().split('T')[0];
      atual.fim = hoje;
      anterior.inicio = sessentaDiasAtras.toISOString().split('T')[0];
      anterior.fim = trintaDiasAtras.toISOString().split('T')[0];
    }

    const clienteWhere = cliente ? ' AND lower(cliente) = lower(?)' : '';
    const clienteParams = cliente ? [cliente] : [];

    // Buscar dados do período atual
    const fichasAtual = await dbAll(
      `SELECT produtos, status, cliente FROM fichas WHERE data_inicio BETWEEN ? AND ?${clienteWhere}`,
      [atual.inicio, atual.fim, ...clienteParams]
    );

    // Buscar dados do período anterior
    const fichasAnterior = await dbAll(
      `SELECT produtos, status, cliente FROM fichas WHERE data_inicio BETWEEN ? AND ?${clienteWhere}`,
      [anterior.inicio, anterior.fim, ...clienteParams]
    );

    // Calcular métricas
    function calcularMetricas(fichas) {
      let pedidos = fichas.length;
      let itens = 0;
      let entregues = 0;
      const clientes = new Set();

      fichas.forEach(f => {
        if (f.status === 'entregue') entregues++;
        if (f.cliente) clientes.add(f.cliente);
        if (f.produtos) {
          try {
            const produtos = typeof f.produtos === 'string' ? JSON.parse(f.produtos) : f.produtos;
            produtos.forEach(p => {
              itens += parseInt(p.quantidade) || 0;
            });
          } catch (e) {}
        }
      });

      return {
        pedidos,
        itens,
        clientes: clientes.size,
        taxaEntrega: pedidos > 0 ? Math.round((entregues / pedidos) * 100) : 0
      };
    }

    const metricasAtual = calcularMetricas(fichasAtual);
    const metricasAnterior = calcularMetricas(fichasAnterior);

    // Calcular variações
    function calcularVariacao(atual, anterior) {
      if (anterior === 0) return atual > 0 ? 100 : 0;
      return Math.round(((atual - anterior) / anterior) * 100);
    }

    res.json({
      atual: metricasAtual,
      anterior: metricasAnterior,
      variacao: {
        pedidos: calcularVariacao(metricasAtual.pedidos, metricasAnterior.pedidos),
        itens: calcularVariacao(metricasAtual.itens, metricasAnterior.itens),
        clientes: calcularVariacao(metricasAtual.clientes, metricasAnterior.clientes),
        taxaEntrega: metricasAtual.taxaEntrega - metricasAnterior.taxaEntrega
      }
    });
  } catch (error) {
    console.error('Erro ao buscar comparativo:', error);
    res.status(500).json({ error: 'Erro ao buscar comparativo' });
  }
});

// Indicadores de eficiência
app.get('/api/relatorio/eficiencia', async (req, res) => {
  try {
    const queryData = parseWithZod(res, relatorioPeriodoQuerySchema, req.query, 'Parâmetros de relatório inválidos');
    if (!queryData) return;
    const now = new Date();
    const whereParts = [];
    const params = [];
    adicionarFiltrosRelatorio(whereParts, params, queryData, 'data_inicio');
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Buscar fichas entregues para calcular tempo médio
    const fichasEntregues = await dbAll(`
      SELECT data_inicio, data_entregue 
      FROM fichas 
      ${whereClause ? whereClause + ' AND' : 'WHERE'} 
      status = 'entregue' AND data_entregue IS NOT NULL AND data_inicio IS NOT NULL
    `, params);

    let tempoMedio = 0;
    if (fichasEntregues.length > 0) {
      let totalDias = 0;
      fichasEntregues.forEach(f => {
        try {
          const inicio = new Date(f.data_inicio);
          const entrega = new Date(f.data_entregue);
          const dias = Math.ceil((entrega - inicio) / (1000 * 60 * 60 * 24));
          if (dias >= 0) totalDias += dias;
        } catch (e) {}
      });
      tempoMedio = Math.round(totalDias / fichasEntregues.length);
    }

    // Buscar pedidos atrasados (pendentes com data_entrega no passado)
    const hoje = now.toISOString().split('T')[0];
    let atrasadosParams = [...params];
    let atrasadosWhere = whereClause ? whereClause + ' AND' : 'WHERE';

    const atrasados = await dbGet(`
      SELECT COUNT(*) as total 
      FROM fichas 
      ${atrasadosWhere} status != 'entregue' AND data_entrega < ?
    `, [...atrasadosParams, hoje]);

    // Buscar pedidos de eventos
    const eventos = await dbGet(`
      SELECT COUNT(*) as total 
      FROM fichas 
      ${whereClause ? whereClause + ' AND' : 'WHERE'} evento = 'sim'
    `, params);

    // Buscar clientes recorrentes (mais de 1 pedido)
    const recorrentes = await dbGet(`
      SELECT COUNT(*) as total FROM (
        SELECT cliente 
        FROM fichas 
        ${whereClause ? whereClause + ' AND' : 'WHERE'} cliente IS NOT NULL AND cliente != ''
        GROUP BY cliente 
        HAVING COUNT(*) > 1
      )
    `, params);

    res.json({
      tempoMedioEntrega: tempoMedio,
      pedidosAtrasados: atrasados?.total || 0,
      pedidosEventos: eventos?.total || 0,
      clientesRecorrentes: recorrentes?.total || 0
    });
  } catch (error) {
    console.error('Erro ao buscar eficiência:', error);
    res.status(500).json({ error: 'Erro ao buscar indicadores de eficiência' });
  }
});

const PAGE_ROUTE_TO_FILE = Object.freeze({
  '/': 'index.html',
  '/index': 'index.html',
  '/dashboard': 'dashboard.html',
  '/ficha': 'ficha.html',
  '/clientes': 'clientes.html',
  '/kanban': 'kanban.html',
  '/relatorios': 'relatorios.html',
  '/relatorios-cliente': 'relatorios_cliente.html',
  '/relatorios_cliente': 'relatorios_cliente.html',
  '/design-system': 'design-system.html',
  '/offline': 'offline.html'
});

function normalizePagePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

// Rota catch-all
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Rota de API não encontrada' });
  }

  const pagePath = normalizePagePath(req.path);
  const pageFile = PAGE_ROUTE_TO_FILE[pagePath] || 'index.html';
  res.sendFile(path.join(__dirname, 'public', pageFile));
});

// Bootstrap da aplicação (suporta ambiente serverless e execução local)
let databaseInitPromise = null;

function ensureDatabaseInitialized() {
  if (!databaseInitPromise) {
    databaseInitPromise = initDatabase().catch((error) => {
      databaseInitPromise = null;
      throw error;
    });
  }
  return databaseInitPromise;
}

export default app;

if (process.env.VERCEL) {
  try {
    await ensureDatabaseInitialized();
  } catch (error) {
    console.error('[bootstrap] Falha inicial de banco no ambiente Vercel. Nova tentativa ocorrerá na próxima requisição:', error);
  }
} else {
  ensureDatabaseInitialized().then(() => {
    const server = app.listen(PORT, () => {
      console.log('Servidor rodando em http://localhost:' + PORT);
      console.log('Banco de dados: Turso (LibSQL)');
      console.log('Cloudinary: ' + CLOUDINARY_CONFIG.cloudName);
      console.log('Encoding UTF-8 configurado');
    });

    server.on('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        console.error(`Porta ${PORT} já está em uso. Finalize o processo atual ou ajuste PORT no .env.`);
        process.exit(1);
      }
      console.error('Erro ao iniciar servidor HTTP:', error);
      process.exit(1);
    });
  }).catch(error => {
    console.error('Falha ao iniciar servidor:', error);
    process.exit(1);
  });
}

