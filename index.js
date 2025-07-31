require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;
const webhookURL = process.env.WEBHOOK_URL;

app.use(express.json());

let qrCodeText = '';
let isClientReady = false;

// Inicializa WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

// Generar ZIP
async function createSessionZip() {
  const sourceDir = path.join(__dirname, '.wwebjs_auth');
  const zipPath = path.join(__dirname, 'auth', 'session.zip');
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await fs.ensureDir(path.dirname(zipPath));

  return new Promise((resolve, reject) => {
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();

    output.on('close', async () => {
      console.log(`✅ Session.zip creado (${archive.pointer()} bytes)`);

      // Copia a carpeta de Descargas
      const downloadsFolder = path.join(os.homedir(), 'Downloads');
      const destPath = path.join(downloadsFolder, 'session.zip');

      await fs.copy(zipPath, destPath);
      console.log(`📦 Copiado a Descargas: ${destPath}`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
  });
}

// Eventos del cliente
client.on('qr', (qr) => {
  qrCodeText = qr;
  console.log('📷 QR recibido, esperando escaneo...');
});

client.on('ready', async () => {
  isClientReady = true;
  console.log('✅ WhatsApp conectado');

  try {
    await createSessionZip();
  } catch (err) {
    console.error('❌ Error al crear session.zip:', err.message);
  }
});

client.on('auth_failure', () => {
  console.error('❌ Falló la autenticación');
});

client.on('disconnected', (reason) => {
  console.log('🔌 Cliente desconectado:', reason);
});

client.initialize();

// Endpoint QR
app.get('/qr', (req, res) => {
  if (!qrCodeText) return res.status(404).send('QR aún no generado');
  res.send(`<pre>${qrCodeText}</pre>`);
});

// Endpoint para N8N
app.post('/webhook', async (req, res) => {
  if (!isClientReady) return res.status(503).send('Cliente no listo');

  const { to, message, media } = req.body;
  try {
    if (media) {
      const mediaObj = await MessageMedia.fromUrl(media);
      await client.sendMessage(to, mediaObj);
    } else {
      await client.sendMessage(to, message);
    }
    res.send('📤 Enviado con éxito');
  } catch (err) {
    console.error('❌ Error al enviar:', err.message);
    res.status(500).send('Error al enviar mensaje');
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${port}`);
});
