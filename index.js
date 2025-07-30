require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { uploadSessionFile, downloadSessionFile } = require('./driveSession');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

let qrCodeText = '';
let isClientReady = false;

// Inicializa WhatsApp con sesión restaurada desde Google Drive
(async () => {
  const sessionExists = await downloadSessionFile();
  if (sessionExists) {
    console.log('🔁 Sesión restaurada desde Google Drive');
  } else {
    console.log('🔐 No se encontró sesión previa. Se generará un nuevo QR.');
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './auth_data',
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  // Mostrar QR en consola y endpoint
  client.on('qr', qr => {
    qrCodeText = qr;
    console.log('📲 Escaneá este código QR:\n');
    qrcode.generate(qr, { small: true });
    console.log('🌐 QR disponible en: https://bot-00-qt68.onrender.com/qr');
  });

  // Conexión lista
  client.on('ready', () => {
    isClientReady = true;
    console.log('✅ WhatsApp conectado');
    uploadSessionFile(); // Guardar sesión en Drive al conectarse
  });

  // Reenviar mensaje entrante a n8n
  client.on('message', async msg => {
    const sender = msg.from;
    const message = msg.body;
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

    const operationId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();

    let mediaUrl = null;
    let messageType = "text";

    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media) {
        mediaUrl = `data:${media.mimetype};base64,${media.data}`;
        const mime = media.mimetype;

        if (mime.startsWith("image/")) {
          messageType = "image";
        } else if (mime.startsWith("audio/")) {
          messageType = "audio";
        } else if (mime.startsWith("video/")) {
          messageType = "video";
        } else {
          messageType = "document";
        }
      }
    }

    const payload = {
      id: operationId,
      timestamp,
      number: sender,
      message,
      mediaUrl,
      messageType,
    };

    try {
      await axios.post(n8nWebhookUrl, payload);
      console.log(`📨 Mensaje reenviado a n8n. ID: ${operationId}, Fecha: ${timestamp}`);
    } catch (error) {
      console.error(`❌ Error al enviar mensaje a n8n (ID: ${operationId}):`, error.response?.data || error.message);
    }
  });

  // Endpoint para mostrar QR
  app.get('/qr', (req, res) => {
    if (!qrCodeText) {
      return res.send('❌ QR no disponible aún. Esperá que cargue.');
    }

    const qrPage = `
      <html>
        <head><title>QR de WhatsApp</title></head>
        <body style="text-align:center;font-family:sans-serif">
          <h2>Escaneá este código QR</h2>
          <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
            qrCodeText
          )}&size=300x300" />
          <p>🔁 Refrescá la página si tarda mucho.</p>
        </body>
      </html>
    `;
    res.send(qrPage);
  });

  // Endpoint de prueba
  app.get('/', (req, res) => {
    res.send('API OK');
  });

  // Envío de mensajes vía POST
  app.post('/reply', async (req, res) => {
    if (!isClientReady) {
      return res.status(400).json({ error: 'WhatsApp no está listo aún' });
    }

    const { number, message, mediaUrl } = req.body;
    const chatId = number.includes('@') ? number : `${number}@c.us`;

    try {
      const chat = await client.getChatById(chatId);

      if (mediaUrl) {
        const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
        await chat.sendMessage(media, { caption: message || '' });
      } else {
        await chat.sendMessage(message);
      }

      res.json({ status: 'ok' });
    } catch (err) {
      console.error('❌ Error al enviar mensaje POST:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Envío de mensajes vía GET
  app.get('/reply', async (req, res) => {
    if (!isClientReady) {
      return res.status(400).send('WhatsApp no está listo aún');
    }

    const rawNumber = req.query.number;
    const message = req.query.message;
    const chatId = rawNumber.includes('@') ? rawNumber : `${rawNumber}@c.us`;

    try {
      const chat = await client.getChatById(chatId);
      await chat.sendMessage(message);
      res.send('Mensaje enviado 👍');
    } catch (err) {
      console.error('❌ Error al enviar mensaje GET:', err);
      res.status(500).send('Error: ' + err.message);
    }
  });

  // Iniciar cliente WhatsApp
  client.initialize();

})();

// Iniciar servidor Express
app.listen(port, () => {
  console.log(`🚀 API escuchando en http://localhost:${port}`);
});
