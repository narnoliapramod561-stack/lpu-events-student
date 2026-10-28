import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const studentPublic = path.resolve('/Users/subhamkumar/Desktop/lpu1/lpu-events-student/public');

async function optimizeImages() {
  console.log('--- STARTING IMAGE OPTIMIZATION ---');

  // 1. Campus Background (was 375 KB, 1920x1080)
  const bgPath = path.join(studentPublic, 'lpu-events-campus-glass-background.webp');
  if (fs.existsSync(bgPath)) {
    const origSize = fs.statSync(bgPath).size;
    const buf = await sharp(bgPath)
      .resize(1600, 900, { fit: 'cover' })
      .webp({ quality: 75, effort: 6 })
      .toBuffer();
    fs.writeFileSync(bgPath, buf);
    console.log(`Campus Background: ${origSize} -> ${buf.length} bytes (-${Math.round((1 - buf.length / origSize) * 100)}%)`);
  }

  // 2. Hero Default (was 237 KB, 1920x1080)
  const heroPath = path.join(studentPublic, 'defaults/hero_default.webp');
  if (fs.existsSync(heroPath)) {
    const origSize = fs.statSync(heroPath).size;
    const buf = await sharp(heroPath)
      .resize(1440, 810, { fit: 'cover' })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();
    fs.writeFileSync(heroPath, buf);
    console.log(`Hero Default: ${origSize} -> ${buf.length} bytes (-${Math.round((1 - buf.length / origSize) * 100)}%)`);
  }

  // 3. Card Default (was 113 KB, 1920x1080)
  const cardPath = path.join(studentPublic, 'defaults/card_default.webp');
  if (fs.existsSync(cardPath)) {
    const origSize = fs.statSync(cardPath).size;
    const buf = await sharp(cardPath)
      .resize(640, 360, { fit: 'cover' })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();
    fs.writeFileSync(cardPath, buf);
    console.log(`Card Default: ${origSize} -> ${buf.length} bytes (-${Math.round((1 - buf.length / origSize) * 100)}%)`);
  }

  // 4. Subcategory Defaults (57 files, each 115 KB, 1920x1080)
  const subcatDir = path.join(studentPublic, 'defaults/events/subcategories');
  if (fs.existsSync(subcatDir)) {
    const files = fs.readdirSync(subcatDir).filter(f => f.endsWith('.webp'));
    let totalOrig = 0;
    let totalNew = 0;
    for (const f of files) {
      const p = path.join(subcatDir, f);
      const origSize = fs.statSync(p).size;
      totalOrig += origSize;
      const buf = await sharp(p)
        .resize(640, 360, { fit: 'cover' })
        .webp({ quality: 80, effort: 6 })
        .toBuffer();
      fs.writeFileSync(p, buf);
      totalNew += buf.length;
    }
    console.log(`Subcategories (57 files): ${totalOrig} -> ${totalNew} bytes (-${Math.round((1 - totalNew / totalOrig) * 100)}%)`);
  }

  console.log('--- ALL IMAGES OPTIMIZED SUCCESSFULLY ---');
}

optimizeImages().catch(err => {
  console.error('Error optimizing images:', err);
  process.exit(1);
});
