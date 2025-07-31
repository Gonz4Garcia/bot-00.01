const fs = require('fs');
const archiver = require('archiver');
const { google } = require('googleapis');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');
const ZIP_PATH = path.join(__dirname, 'session.zip');
const FILE_NAME = 'session.zip';
const FOLDER_ID = '1ejHiPFpVrxXFNr8RRKEsZaQUWPf7cOl3';

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

async function zipSession() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_PATH);
    const archive = archiver('zip');
    output.on('close', () => resolve(ZIP_PATH));
    archive.on('error', err => reject(err));
    archive.pipe(output);
    archive.directory(SESSION_DIR, false);
    archive.finalize();
  });
}

async function uploadSessionToDrive() {
  await zipSession();

  const existing = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name='${FILE_NAME}'`,
    fields: 'files(id)',
  });

  if (existing.data.files.length) {
    await drive.files.update({
      fileId: existing.data.files[0].id,
      media: { body: fs.createReadStream(ZIP_PATH) }
    });
  } else {
    await drive.files.create({
      resource: { name: FILE_NAME, parents: [FOLDER_ID] },
      media: { body: fs.createReadStream(ZIP_PATH) },
      fields: 'id',
    });
  }
}

async function downloadSessionFromDrive() {
  const result = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name='${FILE_NAME}'`,
    fields: 'files(id, name)'
  });

  if (!result.data.files.length) return false;

  const fileId = result.data.files[0].id;
  const dest = fs.createWriteStream(ZIP_PATH);
  await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
    .then(res => new Promise((resolve, reject) => {
      res.data
        .on('end', () => resolve())
        .on('error', err => reject(err))
        .pipe(dest);
    }));

  const unzip = require('unzipper');
  await fs.createReadStream(ZIP_PATH).pipe(unzip.Extract({ path: SESSION_DIR })).promise();
  return true;
}

module.exports = { uploadSessionToDrive, downloadSessionFromDrive };
