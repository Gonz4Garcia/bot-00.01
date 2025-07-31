require('dotenv').config();
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { uploadSessionToDrive, downloadSessionFromDrive } = require('./driveSession');
const axios = require('axios');
const path = require('path');

const SESSION_PATH = './.wwebjs_auth/session.zip';

const app = express();
app.use(express.json());

let qrCodeText = '';
let isClientReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Manejar QR
client.on('qr', (qr) => {
  qrCodeText = qr;
  qrcode.generate(qr, { small: true });
  console.log('📷 QR recibido, esperando escaneo...');
});

// Cliente listo
client.on('ready', async () => {
  console.log('✅ WhatsApp conectado');
  isClientReady = true;

  // Subir sesión a Drive
  try {
    await uploadSessionToDrive();
    console.log('📦 auth_data comprimido y subido a Drive');
  } catch (err) {
    console.error('❌ Error al subir session:', err.message);
  }
});

// Escuchar mensajes
client.on('message', async (msg) => {
  console.log(`💬 Mensaje recibido de ${msg.from}: ${msg.body}`);
});

// Inicializar cliente
(async () => {
  try {
    const downloaded = await downloadSessionFromDrive();
    if (downloaded) {
      console.log('📥 Sesión descargada desde Google Drive.');
    } else {
      console.log('⚠️ No se encontró sesión en Drive. Se generará nuevo QR.');
    }
    await client.initialize();
  } catch (err) {
    console.error('❌ Error durante inicialización:', err.message);
  }
})();

// Endpoint para consultar QR
app.get('/qr', (req, res) => {
  res.json({
    qr: qrCodeText || 'No disponible',
    ready: isClientReady,
  });
});

// Endpoint para recibir mensajes desde n8n
app.post('/webhook', async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!number || !message) {
      return res.status(400).json({ error: 'Falta number o message en body.' });
    }
    await client.sendMessage(number, message);
    res.json({ status: 'enviado' });
  } catch (err) {
    console.error('❌ Error al enviar mensaje desde webhook:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
