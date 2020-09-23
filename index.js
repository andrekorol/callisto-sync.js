const { DateTime } = require('luxon');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { Storage } = require('@google-cloud/storage');
const util = require('util');
const path = require('path');
const fs = require('fs');
const streamPipeline = util.promisify(require('stream').pipeline);
const os = require('os');

require('dotenv').config();

(async () => {
  const callistoServerURL =
    'http://soleil.i4ds.ch/solarradio/data/2002-20yy_Callisto';

  const today = DateTime.local().toFormat('yyyy/MM/dd');

  const callistoDateURL = `${callistoServerURL}/${today}`;

  const res = await fetch(callistoDateURL);

  const body = await res.text();

  const $ = cheerio.load(body);

  const fits = [];
  $('a').each((i, link) => {
    const href = $(link).attr('href');
    if (String(href).includes('.fit.gz')) fits.push(href);
  });

  const storage = new Storage({
    keyFilename: process.env.GCLOUD_SERVICE_ACCOUNT_KEY,
  });

  const bucketName = process.env.BUCKET_NAME;

  const tmpDir = os.tmpdir();

  const destDir = fs.mkdtempSync(`${tmpDir}${path.sep}`);

  const downloadFitsFiles = () => {
    const downloadPromises = fits.map(
      (fitsfile) =>
        new Promise((resolve, reject) => {
          fetch(`${callistoDateURL}/${fitsfile}`).then((resp) => {
            if (!resp.ok) reject(new Error(`${resp.statusText}`));
            streamPipeline(
              resp.body,
              fs.createWriteStream(path.join(destDir, fitsfile))
            )
              .then(() => {
                console.log(`Successfully downloaded ${fitsfile}`);
                resolve();
              })
              .catch(() => reject(new Error(`Failed to download ${fitsfile}`)));
          });
        })
    );
    return Promise.allSettled(downloadPromises);
  };

  const uploadFitsFiles = () => {
    const uploadPromises = fits.map(
      (fitsfile) =>
        new Promise((resolve, reject) => {
          storage
            .bucket(bucketName)
            .upload(path.join(destDir, fitsfile), {
              // Support for HTTP requests made with `Accept-Encoding: gzip`
              gzip: true,
              // By setting the option `destination`, you can change the name of the
              // object you are uploading to a bucket.
              metadata: {
                // Enable long-lived HTTP caching headers
                // Use only if the contents of the file will never change
                // (If the contents will change, use cacheControl: 'no-cache')
                cacheControl: 'public, max-age=31536000',
              },
              destination: `${today}/${fitsfile}`,
              timeout: 10 * 60 * 1000, // timeout in 10 minutes
            })
            .then(() => {
              console.log(`Successfully uploaded ${fitsfile}`);
              resolve();
            })
            .catch(() => reject(new Error(`Failed to upload ${fitsfile}`)));
        })
    );
    return Promise.allSettled(uploadPromises);
  };

  downloadFitsFiles()
    .then(() => uploadFitsFiles())
    .then(() => {
      console.log('Finished uploading FITS files to Google Cloud Storage');
      fs.unlinkSync(destDir);
    })
    .catch((reason) => {
      throw reason;
    });
})();
