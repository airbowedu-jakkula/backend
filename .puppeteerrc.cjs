/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Skip downloading Chrome on cloud environments (Render, Heroku, etc.)
  // On AWS/production, Chrome is installed via apt-get at /usr/bin/google-chrome
  skipDownload: true,
};
