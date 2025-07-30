const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// 👉 ID de la carpeta compartida de Drive
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const filePath = path.join(__dirname, 'session.zip');
const fileName = 'session.zip';

const auth = new google.auth.GoogleAuth({
  credentials: {
    type: "service_account",
    project_id: process.env.GDRIVE_PROJECT_ID,
    private_key_id: process.env.GDRIVE_PRIVATE_KEY_ID,
    private_key: process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GDRIVE_CLIENT_EMAIL,
    client_id: process.env.GDRIVE_CLIENT_ID,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

async function uploadSessionFile() {
  try {
    const existing = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${fileName}' and trashed = false`,
      fields: 'files(id)',
    });

    for (const file of existing.data.files) {
      await drive.files.delete({ fileId: file.id });
    }

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
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${fileName}' and trashed = false`,
      fields: 'files(id)',
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
