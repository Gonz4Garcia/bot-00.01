const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SESSION_PATH = path.join(__dirname, 'auth_data.zip');
const SESSION_DRIVE_FILE_NAME = 'auth_data.zip';

async function authorize() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = JSON.parse(process.env.GOOGLE_TOKEN);
  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}

async function uploadSession() {
  const auth = await authorize();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: SESSION_DRIVE_FILE_NAME,
  };
  const media = {
    mimeType: 'application/zip',
    body: fs.createReadStream(SESSION_PATH),
  };

  // Elimina archivo anterior si existe
  const list = await drive.files.list({
    q: `name='${SESSION_DRIVE_FILE_NAME}'`,
    fields: 'files(id, name)',
  });

  if (list.data.files.length > 0) {
    await drive.files.delete({ fileId: list.data.files[0].id });
  }

  await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id',
  });

  console.log('✅ auth_data.zip subido a Google Drive.');
}

async function downloadSession() {
  const auth = await authorize();
  const drive = google.drive({ version: 'v3', auth });

  const list = await drive.files.list({
    q: `name='${SESSION_DRIVE_FILE_NAME}'`,
    fields: 'files(id, name)',
  });

  if (list.data.files.length === 0) {
    return false;
  }

  const fileId = list.data.files[0].id;
  const dest = fs.createWriteStream(SESSION_PATH);

  await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
    (err, res) => {
      if (err) return console.error('❌ Error al descargar sesión:', err);
      res.data.pipe(dest);
    }
  );

  return new Promise((resolve) => {
    dest.on('finish', () => resolve(true));
    dest.on('error', () => resolve(false));
  });
}

module.exports = {
  uploadSession,
  downloadSession,
};
