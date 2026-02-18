import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

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

function normalizeNameCase(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return '';

  return text
    .toLowerCase()
    .split(' ')
    .map((word, index) => word
      .split(/([-/])/)
      .map(part => {
        if (!part || part === '-' || part === '/') return part;
        if (index > 0 && NAME_EXCEPTIONS.has(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(''))
    .join(' ');
}

function normalizeProdutos(produtos) {
  if (!Array.isArray(produtos)) return [];

  return produtos.map(produto => {
    if (!produto || typeof produto !== 'object') return produto;
    return {
      ...produto,
      descricao: normalizeNameCase(produto.descricao || '')
    };
  });
}

function normalizeFichaPayload(dados) {
  return {
    ...dados,
    cliente: normalizeNameCase(dados?.cliente || ''),
    vendedor: normalizeNameCase(dados?.vendedor || ''),
    corPeDeGolaInterno: normalizeNameCase(dados?.corPeDeGolaInterno || ''),
    corPeDeGolaExterno: normalizeNameCase(dados?.corPeDeGolaExterno || ''),
    corBotao: normalizeNameCase(dados?.corBotao || ''),
    produtos: normalizeProdutos(dados?.produtos)
  };
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
  }
}));

// ==================== CONEXÃO TURSO ====================
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error('Configuração ausente: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente.');
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Inicializar banco de dados
async function initDatabase() {
  try {
    // Criar tabela de fichas
    await db.execute(`
      CREATE TABLE IF NOT EXISTS fichas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        vendedor TEXT,
        data_inicio DATE,
        numero_venda TEXT,
        data_entrega DATE,
        evento TEXT DEFAULT 'nao',
        status TEXT DEFAULT 'pendente',
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
        observacoes TEXT,
        imagem_data TEXT,
        imagens_data TEXT,
        produtos TEXT,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_entregue DATETIME
      )
    `);

    // Criar tabela de clientes
    await db.execute(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT UNIQUE NOT NULL,
        primeiro_pedido DATE,
        ultimo_pedido DATE,
        total_pedidos INTEGER DEFAULT 0,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar índices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_fichas_cliente ON fichas(cliente)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_fichas_status ON fichas(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_fichas_data_inicio ON fichas(data_inicio)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_fichas_data_entrega ON fichas(data_entrega)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_fichas_vendedor ON fichas(vendedor)`);

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
      'faixa_cor TEXT'
    ];

    for (const coluna of migrações) {
      try {
        await db.execute(`ALTER TABLE fichas ADD COLUMN ${coluna}`);
        console.log(`✅ Coluna ${coluna.split(' ')[0]} adicionada`);
      } catch (e) {
        // Coluna já existe, ignorar
      }
    }

    console.log('✅ Banco de dados Turso inicializado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    throw error;
  }
}

// ==================== FUNÇÕES AUXILIARES ====================

async function dbAll(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

async function dbGet(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function dbRun(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return {
    lastInsertRowid: result.lastInsertRowid,
    rowsAffected: result.rowsAffected
  };
}

// ==================== ROTAS DA API ====================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.execute('SELECT 1');
    res.json({ status: 'ok', database: 'turso connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Listar todas as fichas
app.get('/api/fichas', async (req, res) => {
  try {
    const { status, cliente, vendedor, dataInicio, dataFim } = req.query;

    let query = 'SELECT * FROM fichas WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (cliente) {
      query += ' AND cliente LIKE ?';
      params.push(`%${cliente}%`);
    }

    if (vendedor) {
      query += ' AND vendedor = ?';
      params.push(vendedor);
    }

    if (dataInicio) {
      query += ' AND data_inicio >= ?';
      params.push(dataInicio);
    }

    if (dataFim) {
      query += ' AND data_inicio <= ?';
      params.push(dataFim);
    }

    query += ' ORDER BY id DESC';

    const fichas = await dbAll(query, params);

    // Parse produtos JSON
    const fichasFormatadas = fichas.map(ficha => {
      const f = { ...ficha };
      if (f.produtos) {
        try {
          f.produtos = JSON.parse(f.produtos);
        } catch (e) {
          f.produtos = [];
        }
      }
      return f;
    });

    res.json(fichasFormatadas);
  } catch (error) {
    console.error('Erro ao listar fichas:', error);
    res.status(500).json({ error: 'Erro ao listar fichas' });
  }
});

// Buscar ficha por ID
app.get('/api/fichas/:id', async (req, res) => {
  try {
    const ficha = await dbGet('SELECT * FROM fichas WHERE id = ?', [req.params.id]);

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
  try {
    const dados = normalizeFichaPayload(req.body);
    const produtosJson = JSON.stringify(dados.produtos || []);
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO fichas (
        cliente, vendedor, data_inicio, numero_venda, data_entrega, evento,
        material, composicao, cor_material, manga, acabamento_manga, largura_manga, cor_acabamento_manga,
        gola, cor_gola, acabamento_gola, largura_gola, cor_peitilho_interno, cor_peitilho_externo, cor_pe_de_gola_interno, cor_pe_de_gola_externo, cor_botao,
        abertura_lateral, cor_abertura_lateral, reforco_gola, cor_reforco, bolso,
        filete, filete_local, filete_cor, faixa, faixa_local, faixa_cor,
        arte, observacoes, imagem_data, imagens_data, produtos, data_criacao, data_atualizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      dados.arte, dados.observacoes, dados.imagemData, dados.imagensData,
      produtosJson, now, now
    ];

    const result = await dbRun(sql, params);
    const novoId = Number(result.lastInsertRowid);

    // Atualizar tabela de clientes
    if (dados.cliente) {
      await atualizarCliente(dados.cliente, dados.dataInicio);
    }

    console.log(`✅ Ficha #${novoId} criada`);
    res.status(201).json({ id: novoId, message: 'Ficha criada com sucesso' });
  } catch (error) {
    console.error('Erro ao criar ficha:', error);
    res.status(500).json({ error: 'Erro ao criar ficha' });
  }
});

// Atualizar ficha
app.put('/api/fichas/:id', async (req, res) => {
  try {
    const fichaExiste = await dbGet('SELECT id FROM fichas WHERE id = ?', [req.params.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    const dados = normalizeFichaPayload(req.body);
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
        arte = ?, observacoes = ?, imagem_data = ?, imagens_data = ?,
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
      dados.arte, dados.observacoes, dados.imagemData, dados.imagensData,
      produtosJson, now, req.params.id
    ];

    await dbRun(sql, params);

    console.log(`✅ Ficha #${req.params.id} atualizada`);
    res.json({ id: parseInt(req.params.id), message: 'Ficha atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar ficha:', error);
    res.status(500).json({ error: 'Erro ao atualizar ficha' });
  }
});

// Marcar ficha como entregue
app.patch('/api/fichas/:id/entregar', async (req, res) => {
  try {
    const fichaExiste = await dbGet('SELECT id FROM fichas WHERE id = ?', [req.params.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    const now = new Date().toISOString();
    await dbRun(`UPDATE fichas SET status = 'entregue', data_entregue = ? WHERE id = ?`, [now, req.params.id]);

    console.log(`✅ Ficha #${req.params.id} marcada como entregue`);
    res.json({ message: 'Ficha marcada como entregue' });
  } catch (error) {
    console.error('Erro ao marcar como entregue:', error);
    res.status(500).json({ error: 'Erro ao marcar como entregue' });
  }
});

// Desmarcar ficha (voltar para pendente)
app.patch('/api/fichas/:id/pendente', async (req, res) => {
  try {
    const fichaExiste = await dbGet('SELECT id FROM fichas WHERE id = ?', [req.params.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    await dbRun(`UPDATE fichas SET status = 'pendente', data_entregue = NULL WHERE id = ?`, [req.params.id]);

    console.log(`✅ Ficha #${req.params.id} voltou para pendente`);
    res.json({ message: 'Ficha marcada como pendente' });
  } catch (error) {
    console.error('Erro ao marcar como pendente:', error);
    res.status(500).json({ error: 'Erro ao marcar como pendente' });
  }
});

// Deletar ficha
app.delete('/api/fichas/:id', async (req, res) => {
  try {
    const fichaExiste = await dbGet('SELECT id FROM fichas WHERE id = ?', [req.params.id]);

    if (!fichaExiste) {
      return res.status(404).json({ error: 'Ficha não encontrada' });
    }

    await dbRun('DELETE FROM fichas WHERE id = ?', [req.params.id]);

    console.log(`✅ Ficha #${req.params.id} deletada`);
    res.json({ message: 'Ficha deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar ficha:', error);
    res.status(500).json({ error: 'Erro ao deletar ficha' });
  }
});

// Buscar clientes (autocomplete)
app.get('/api/clientes', async (req, res) => {
  try {
    const { termo } = req.query;
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
    const { id } = req.params;
    const { nome, primeiro_pedido, ultimo_pedido } = req.body;
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
      console.log(`📝 Nome do cliente atualizado nas fichas: "${clienteExiste.nome}" -> "${nomeFinal}"`);
    }

    console.log(`✅ Cliente #${id} atualizado`);
    res.json({ message: 'Cliente atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// Deletar cliente
app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const clienteExiste = await dbGet('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!clienteExiste) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    await dbRun('DELETE FROM clientes WHERE id = ?', [id]);

    console.log(`✅ Cliente #${id} (${clienteExiste.nome}) deletado`);
    res.json({ message: 'Cliente excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar cliente:', error);
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

// Estatísticas gerais
app.get('/api/estatisticas', async (req, res) => {
  try {
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
  res.json({
    cloudName: CLOUDINARY_CONFIG.cloudName,
    apiKey: CLOUDINARY_CONFIG.apiKey,
    uploadPreset: CLOUDINARY_CONFIG.uploadPreset
  });
});

// Gerar assinatura para upload signed
app.post('/api/cloudinary/signature', (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'fichas';
    const transformation = 'c_limit,w_1500,h_1500,q_auto:good';

    const paramsToSign = {
      timestamp,
      folder,
      transformation,
      ...req.body
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

    console.log(`📦 Encontradas ${fichas.length} fichas com imagens para migrar`);

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
          console.log(`✅ Ficha #${ficha.id}: ${imagensAtualizadas.length} imagem(ns) migrada(s)`);
        }

      } catch (err) {
        console.error(`❌ Erro na ficha #${ficha.id}:`, err);
        resultados.erros.push(`Ficha #${ficha.id}: ${err.message}`);
      }
    }

    console.log(`🎉 Migração concluída: ${resultados.migradas}/${resultados.total} fichas`);
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
    const { publicId } = req.params;
    const excludeFichaId = req.query.excludeFichaId ? Number(req.query.excludeFichaId) : null;
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
      console.log(`🗑️ Imagem deletada do Cloudinary: ${realPublicId}`);
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
    }
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
  }
}

// ==================== ROTAS DE RELATÓRIO DETALHADO ====================

// Relatório principal (ÚNICA definição - usa data_entregue para entregues, data_inicio para pendentes)
app.get('/api/relatorio', async (req, res) => {
  try {
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    const relatorio = {};

    // ---- Fichas entregues (filtradas por data_entregue) ----
    let sqlEntregues = '';
    let paramsEntregues = [];

    if (periodo === 'mes') {
      sqlEntregues = `SELECT COUNT(*) as total FROM fichas WHERE status = 'entregue' AND substr(date(data_entregue), 1, 7) = ?`;
      paramsEntregues = [mesAtual];
    } else if (periodo === 'ano') {
      sqlEntregues = `SELECT COUNT(*) as total FROM fichas WHERE status = 'entregue' AND substr(date(data_entregue), 1, 4) = ?`;
      paramsEntregues = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      sqlEntregues = `SELECT COUNT(*) as total FROM fichas WHERE status = 'entregue' AND date(data_entregue) BETWEEN ? AND ?`;
      paramsEntregues = [dataInicio, dataFim];
    } else {
      sqlEntregues = `SELECT COUNT(*) as total FROM fichas WHERE status = 'entregue'`;
    }

    const entreguesResult = await dbGet(sqlEntregues, paramsEntregues);
    relatorio.fichasEntregues = entreguesResult?.total || 0;

    // ---- Fichas pendentes (filtradas por data_inicio) ----
    let sqlPendentes = '';
    let paramsPendentes = [];

    if (periodo === 'mes') {
      sqlPendentes = `SELECT COUNT(*) as total FROM fichas WHERE status = 'pendente' AND substr(data_inicio, 1, 7) = ?`;
      paramsPendentes = [mesAtual];
    } else if (periodo === 'ano') {
      sqlPendentes = `SELECT COUNT(*) as total FROM fichas WHERE status = 'pendente' AND substr(data_inicio, 1, 4) = ?`;
      paramsPendentes = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      sqlPendentes = `SELECT COUNT(*) as total FROM fichas WHERE status = 'pendente' AND data_inicio BETWEEN ? AND ?`;
      paramsPendentes = [dataInicio, dataFim];
    } else {
      sqlPendentes = `SELECT COUNT(*) as total FROM fichas WHERE status = 'pendente'`;
    }

    const pendentesResult = await dbGet(sqlPendentes, paramsPendentes);
    relatorio.fichasPendentes = pendentesResult?.total || 0;

    // ---- Itens confeccionados (entregues, filtrados por data_entregue) ----
    let sqlItens = '';
    let paramsItens = [];

    if (periodo === 'mes') {
      sqlItens = `SELECT produtos FROM fichas WHERE status = 'entregue' AND substr(date(data_entregue), 1, 7) = ?`;
      paramsItens = [mesAtual];
    } else if (periodo === 'ano') {
      sqlItens = `SELECT produtos FROM fichas WHERE status = 'entregue' AND substr(date(data_entregue), 1, 4) = ?`;
      paramsItens = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      sqlItens = `SELECT produtos FROM fichas WHERE status = 'entregue' AND date(data_entregue) BETWEEN ? AND ?`;
      paramsItens = [dataInicio, dataFim];
    } else {
      sqlItens = `SELECT produtos FROM fichas WHERE status = 'entregue'`;
    }

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
    let sqlClientes = '';
    let paramsClientes = [];

    if (periodo === 'mes') {
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE substr(primeiro_pedido, 1, 7) = ?`;
      paramsClientes = [mesAtual];
    } else if (periodo === 'ano') {
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE substr(primeiro_pedido, 1, 4) = ?`;
      paramsClientes = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      sqlClientes = `SELECT COUNT(*) as total FROM clientes WHERE primeiro_pedido BETWEEN ? AND ?`;
      paramsClientes = [dataInicio, dataFim];
    } else {
      sqlClientes = `SELECT COUNT(*) as total FROM clientes`;
    }

    const clientesResult = await dbGet(sqlClientes, paramsClientes);
    relatorio.novosClientes = clientesResult?.total || 0;

    // ---- Top vendedor ----
    let sqlVendedor = '';
    let paramsVendedor = [];

    if (periodo === 'mes') {
      sqlVendedor = `SELECT vendedor, COUNT(*) as total FROM fichas WHERE vendedor IS NOT NULL AND vendedor != '' AND substr(data_inicio, 1, 7) = ? GROUP BY vendedor ORDER BY total DESC LIMIT 1`;
      paramsVendedor = [mesAtual];
    } else if (periodo === 'ano') {
      sqlVendedor = `SELECT vendedor, COUNT(*) as total FROM fichas WHERE vendedor IS NOT NULL AND vendedor != '' AND substr(data_inicio, 1, 4) = ? GROUP BY vendedor ORDER BY total DESC LIMIT 1`;
      paramsVendedor = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      sqlVendedor = `SELECT vendedor, COUNT(*) as total FROM fichas WHERE vendedor IS NOT NULL AND vendedor != '' AND data_inicio BETWEEN ? AND ? GROUP BY vendedor ORDER BY total DESC LIMIT 1`;
      paramsVendedor = [dataInicio, dataFim];
    } else {
      sqlVendedor = `SELECT vendedor, COUNT(*) as total FROM fichas WHERE vendedor IS NOT NULL AND vendedor != '' GROUP BY vendedor ORDER BY total DESC LIMIT 1`;
    }

    const topVendedor = await dbGet(sqlVendedor, paramsVendedor);
    relatorio.topVendedor = topVendedor ? topVendedor.vendedor : null;
    relatorio.topVendedorTotal = topVendedor ? topVendedor.total : 0;

    // Calcular totalFichas como soma segura
    const totalFichas = relatorio.fichasEntregues + relatorio.fichasPendentes;

    console.log('📊 Relatório gerado:', relatorio);
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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    // Filtro por data_inicio para pedidos totais
    let whereClause = "WHERE vendedor IS NOT NULL AND vendedor != ''";
    let params = [];

    if (periodo === 'mes') {
      whereClause += " AND substr(data_inicio, 1, 7) = ?";
      params = [mesAtual];
    } else if (periodo === 'ano') {
      whereClause += " AND substr(data_inicio, 1, 4) = ?";
      params = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereClause += " AND data_inicio BETWEEN ? AND ?";
      params = [dataInicio, dataFim];
    }

    // Buscar todas as fichas com vendedor (total de pedidos)
    const fichas = await dbAll(`SELECT vendedor, produtos, status, data_entregue FROM fichas ${whereClause}`, params);

    // Filtro por data_entregue para contar entregues no período
    let whereEntregue = "WHERE vendedor IS NOT NULL AND vendedor != '' AND status = 'entregue' AND data_entregue IS NOT NULL";
    let paramsEntregue = [];

    if (periodo === 'mes') {
      whereEntregue += " AND substr(date(data_entregue), 1, 7) = ?";
      paramsEntregue = [mesAtual];
    } else if (periodo === 'ano') {
      whereEntregue += " AND substr(date(data_entregue), 1, 4) = ?";
      paramsEntregue = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereEntregue += " AND date(data_entregue) BETWEEN ? AND ?";
      paramsEntregue = [dataInicio, dataFim];
    }

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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    let whereClause = "WHERE material IS NOT NULL AND material != ''";
    let params = [];

    if (periodo === 'mes') {
      whereClause += " AND substr(data_inicio, 1, 7) = ?";
      params = [mesAtual];
    } else if (periodo === 'ano') {
      whereClause += " AND substr(data_inicio, 1, 4) = ?";
      params = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereClause += " AND data_inicio BETWEEN ? AND ?";
      params = [dataInicio, dataFim];
    }

    const fichas = await dbAll(`SELECT material, produtos FROM fichas ${whereClause}`, params);

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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    let whereClause = '';
    let params = [];

    if (periodo === 'mes') {
      whereClause = "WHERE substr(data_inicio, 1, 7) = ?";
      params = [mesAtual];
    } else if (periodo === 'ano') {
      whereClause = "WHERE substr(data_inicio, 1, 4) = ?";
      params = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereClause = "WHERE data_inicio BETWEEN ? AND ?";
      params = [dataInicio, dataFim];
    }

    const fichas = await dbAll(`SELECT produtos FROM fichas ${whereClause}`, params);

    // Contar produtos por descrição
    const produtosMap = {};
    fichas.forEach(ficha => {
      if (ficha.produtos) {
        try {
          const produtos = typeof ficha.produtos === 'string' ? JSON.parse(ficha.produtos) : ficha.produtos;
          produtos.forEach(p => {
            const desc = (p.descricao || 'Sem descrição').trim();
            if (!produtosMap[desc]) {
              produtosMap[desc] = 0;
            }
            produtosMap[desc] += parseInt(p.quantidade) || 0;
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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    let whereClause = "WHERE cliente IS NOT NULL AND cliente != ''";
    let params = [];

    if (periodo === 'mes') {
      whereClause += " AND substr(data_inicio, 1, 7) = ?";
      params = [mesAtual];
    } else if (periodo === 'ano') {
      whereClause += " AND substr(data_inicio, 1, 4) = ?";
      params = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereClause += " AND data_inicio BETWEEN ? AND ?";
      params = [dataInicio, dataFim];
    }

    const fichas = await dbAll(`SELECT cliente, produtos FROM fichas ${whereClause}`, params);

    // Agrupar por cliente
    const clientesMap = {};
    fichas.forEach(ficha => {
      if (!clientesMap[ficha.cliente]) {
        clientesMap[ficha.cliente] = { total_pedidos: 0, total_itens: 0 };
      }
      clientesMap[ficha.cliente].total_pedidos++;

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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    let whereClause = '';
    let params = [];

    if (periodo === 'mes') {
      whereClause = "WHERE substr(data_inicio, 1, 7) = ?";
      params = [mesAtual];
    } else if (periodo === 'ano') {
      whereClause = "WHERE substr(data_inicio, 1, 4) = ?";
      params = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereClause = "WHERE data_inicio BETWEEN ? AND ?";
      params = [dataInicio, dataFim];
    }

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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    let atual = { inicio: '', fim: '' };
    let anterior = { inicio: '', fim: '' };

    if (periodo === 'mes') {
      const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mesAnterior = now.getMonth() === 0 
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

      atual.inicio = `${mesAtual}-01`;
      atual.fim = `${mesAtual}-31`;
      anterior.inicio = `${mesAnterior}-01`;
      anterior.fim = `${mesAnterior}-31`;
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

    // Buscar dados do período atual
    const fichasAtual = await dbAll(
      `SELECT produtos, status, cliente FROM fichas WHERE data_inicio BETWEEN ? AND ?`,
      [atual.inicio, atual.fim]
    );

    // Buscar dados do período anterior
    const fichasAnterior = await dbAll(
      `SELECT produtos, status, cliente FROM fichas WHERE data_inicio BETWEEN ? AND ?`,
      [anterior.inicio, anterior.fim]
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
    const { periodo, dataInicio, dataFim } = req.query;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = `${now.getFullYear()}`;

    let whereClause = '';
    let params = [];

    if (periodo === 'mes') {
      whereClause = "WHERE substr(data_inicio, 1, 7) = ?";
      params = [mesAtual];
    } else if (periodo === 'ano') {
      whereClause = "WHERE substr(data_inicio, 1, 4) = ?";
      params = [anoAtual];
    } else if (periodo === 'customizado' && dataInicio && dataFim) {
      whereClause = "WHERE data_inicio BETWEEN ? AND ?";
      params = [dataInicio, dataFim];
    }

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

// Rota catch-all
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Iniciar servidor
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log('🚀 Servidor rodando em http://localhost:' + PORT);
    console.log('📊 Banco de dados: Turso (LibSQL)');
    console.log('☁️ Cloudinary: ' + CLOUDINARY_CONFIG.cloudName);
    console.log('✅ Encoding UTF-8 configurado');
  });
}).catch(error => {
  console.error('❌ Falha ao iniciar servidor:', error);
  process.exit(1);
});

