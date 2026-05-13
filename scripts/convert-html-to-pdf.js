const puppeteer = require('puppeteer');
const path = require('path');

async function convertHtmlToPdf(inputHtml, outputPdf) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${path.resolve(inputHtml)}`, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPdf,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
  } finally {
    await browser.close();
  }
}

const inputHtml = process.argv[2];
const outputPdf = process.argv[3];

if (!inputHtml || !outputPdf) {
  console.error('Usage: node scripts/convert-html-to-pdf.js input.html output.pdf');
  process.exit(1);
}

convertHtmlToPdf(inputHtml, outputPdf).catch((err) => {
  console.error(err);
  process.exit(1);
});
