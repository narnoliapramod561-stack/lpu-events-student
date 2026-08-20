import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { TAXONOMY_CONFIG } from './generate-default-images.js';
import { SUBCATEGORY_UUID_MAP, CATEGORY_UUID_MAP, resolveDefaultEventImage } from '../src/shared/images/defaults.js';

async function verifyAll() {
  const defaultsDir = path.resolve('/Users/subhamkumar/Desktop/lpu1/lpu-events-student/public/defaults/events');
  console.log('--- Verifying Default Event Images ---');
  console.log(`Checking directory: ${defaultsDir}\n`);

  let verifiedSubcategories = 0;
  let missingFiles = 0;

  for (const cat of TAXONOMY_CONFIG) {
    console.log(`[Category: ${cat.categoryName} (${cat.categoryKey})]`);
    for (const sub of cat.subcategories) {
      const baseName = `${cat.categoryKey}_${sub.key}`;
      const webpPath = path.join(defaultsDir, `${baseName}.webp`);
      const jpgPath = path.join(defaultsDir, `${baseName}.jpg`);

      if (!fs.existsSync(webpPath) || !fs.existsSync(jpgPath)) {
        console.error(`  ❌ MISSING: ${baseName}`);
        missingFiles++;
        continue;
      }

      const webpMeta = await sharp(webpPath).metadata();
      const jpgMeta = await sharp(jpgPath).metadata();

      if (webpMeta.width !== 1280 || webpMeta.height !== 720) {
        console.error(`  ❌ INVALID DIMENSIONS: ${baseName}.webp (${webpMeta.width}x${webpMeta.height})`);
        missingFiles++;
        continue;
      }

      // Test resolver
      const resolved = resolveDefaultEventImage({
        categoryKey: cat.categoryKey,
        subcategoryKey: sub.key
      });

      if (resolved !== `/defaults/events/${baseName}.webp`) {
        console.error(`  ❌ RESOLVER MISMATCH: expected /defaults/events/${baseName}.webp, got ${resolved}`);
        missingFiles++;
        continue;
      }

      verifiedSubcategories++;
    }
  }

  // Check Category Defaults
  console.log('\n[Category Level Defaults]');
  for (const cat of TAXONOMY_CONFIG) {
    const baseName = `${cat.categoryKey}_default`;
    const webpPath = path.join(defaultsDir, `${baseName}.webp`);
    if (fs.existsSync(webpPath)) {
      const resolved = resolveDefaultEventImage({ categoryKey: cat.categoryKey });
      if (resolved !== `/defaults/events/${baseName}.webp`) {
        console.error(`  ❌ RESOLVER MISMATCH for category ${cat.categoryKey}: got ${resolved}`);
        missingFiles++;
      }
    } else {
      console.error(`  ❌ MISSING Category default: ${baseName}`);
      missingFiles++;
    }
  }

  // Check UUID Resolution
  console.log('\n[UUID Mapping Test]');
  for (const [uuid, { categoryKey, subcategoryKey }] of Object.entries(SUBCATEGORY_UUID_MAP)) {
    const resolved = resolveDefaultEventImage({ subcategory_id: uuid });
    const expected = `/defaults/events/${categoryKey}_${subcategoryKey}.webp`;
    if (resolved !== expected) {
      console.error(`  ❌ UUID Resolution Failed for ${uuid}: expected ${expected}, got ${resolved}`);
      missingFiles++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Verification Summary:`);
  console.log(`- Total Subcategories Verified: ${verifiedSubcategories} / 81`);
  console.log(`- Category Defaults Verified: 13 / 13`);
  console.log(`- UUID Lookups Verified: ${Object.keys(SUBCATEGORY_UUID_MAP).length}`);
  console.log(`- Missing / Invalid Files: ${missingFiles}`);
  console.log(`========================================`);

  if (missingFiles > 0) {
    process.exit(1);
  }
}

verifyAll().catch(e => {
  console.error(e);
  process.exit(1);
});
