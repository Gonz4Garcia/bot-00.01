const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const AdmZip = require('adm-zip');
const archiver = require('archiver');

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });
const fileName = 'session.zip';
const filePath = path.join(__dirname, fileName);

async function findFile(folderId, name) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${name}' and trashed=false`,
    fields: 'files(id, name)',
  });
  return res.data.files[0];
}

async function downloadSessionFile() {
  const folderId = process.env.FOLDER_ID;
  const file = await findFile(folderId, fileName);
  if (!file) {
    console.log('📂 No se encontró session.zip en Drive.');
    return false;
  }

  const dest = fs.createWriteStream(filePath);
  const res = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' });

  await new Promise((resolve, reject) => {
    res.data.pipe(dest);
    res.data.on('end', resolve);
    res.data.on('error', reject);
  });

  console.log('✅ session.zip descargado desde Google Drive.');
  return true;
}

async function uploadSessionFile() {
  const folderId = process.env.FOLDER_ID;
  const file = await findFile(folderId, fileName);

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType: 'application/zip',
    body: fs.createReadStream(filePath),
  };

  if (file) {
    await drive.files.update({
      fileId: file.id,
      media,
    });
    console.log('☁️ session.zip actualizado en Google Drive.');
  } else {
    await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
    });
    console.log('☁️ session.zip subido a Google Drive.');
  }
}

// 👉 Descomprimir sesión
function unzipSession() {
  if (!fs.existsSync(filePath)) return;
  const zip = new AdmZip(filePath);
  zip.extractAllTo('./auth_data', true);
  console.log('📂 Sesión descomprimida en ./auth_data');
}

// 👉 Comprimir sesión
function zipSession() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`📦 session.zip creado (${archive.pointer()} bytes).`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory('./auth_data/Default', false);
    archive.finalize();
  });
}

module.exports = {
  downloadSessionFile,
  uploadSessionFile,
  unzipSession,
  zipSession,
};
