const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// 👉 Asegurate de tener el archivo `credentials.json` en el mismo directorio
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// 👉 ID de la carpeta compartida en Drive donde guardarás session.zip
const FOLDER_ID = '1ejHiPFpVrxXFNr8RRKEsZaQUWPf7cOl3';

const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

async function uploadSessionFile() {
  const filePath = path.join(__dirname, 'session.zip');
  const fileName = 'session.zip';

  try {
    // 🔄 Verifica si ya existe
    const existing = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${fileName}' and trashed = false`,
      fields: 'files(id, name)',
    });

    // 🗑️ Borra si ya existe
    for (const file of existing.data.files) {
      await drive.files.delete({ fileId: file.id });
    }

    // ⬆️ Sube la nueva sesión
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
    });

    console.log('✅ session.zip subido a Drive. ID:', res.data.id);
  } catch (err) {
    console.error('❌ Error al subir session.zip:', err.message);
  }
}

async function downloadSessionFile() {
  const filePath = path.join(__dirname, 'session.zip');

  try {
    // 🔍 Busca session.zip en la carpeta
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='session.zip' and trashed = false`,
      fields: 'files(id, name)',
    });

    if (res.data.files.length === 0) {
      console.log('ℹ️ No hay session.zip en Drive.');
      return false;
    }

    const fileId = res.data.files[0].id;
    const dest = fs.createWriteStream(filePath);

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => {
          console.log('✅ session.zip descargado de Drive.');
          resolve();
        })
        .on('error', err => {
          console.error('❌ Error al descargar session.zip:', err.message);
          reject(err);
        })
        .pipe(dest);
    });

    return true;
  } catch (err) {
    console.error('❌ Error al buscar/descargar session.zip:', err.message);
    return false;
  }
}

module.exports = {
  uploadSessionFile,
  downloadSessionFile,
};
