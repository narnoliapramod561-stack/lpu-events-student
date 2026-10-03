import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateForegroundPlacement } from './expansion.js';

describe('Deterministic Expansion Geometry & Mathematics', () => {
  const TARGET_16_9 = { width: 1600, height: 900 };
  const TARGET_7_5 = { width: 1050, height: 750 };

  it('correctly maps 9:16 portrait to 16:9 canvas without cropping', () => {
    const source = { width: 1080, height: 1920 }; // 9:16
    const fg = calculateForegroundPlacement(source, TARGET_16_9);

    // Height must fill canvas, width must be centered
    assert.strictEqual(fg.height, 900);
    assert.strictEqual(fg.width, Math.round(1080 * (900 / 1920))); // 506
    assert.strictEqual(fg.x, Math.round((1600 - fg.width) / 2));
    assert.strictEqual(fg.y, 0);

    // Verify aspect ratio preservation
    const originalRatio = source.width / source.height;
    const placedRatio = fg.width / fg.height;
    assert.ok(Math.abs(originalRatio - placedRatio) < 0.01);
  });

  it('correctly maps 4:5 portrait to 16:9 canvas without cropping', () => {
    const source = { width: 1200, height: 1500 }; // 4:5
    const fg = calculateForegroundPlacement(source, TARGET_16_9);

    assert.strictEqual(fg.height, 900);
    assert.strictEqual(fg.width, Math.round(1200 * (900 / 1500))); // 720
    assert.strictEqual(fg.x, Math.round((1600 - fg.width) / 2));
    assert.strictEqual(fg.y, 0);

    const originalRatio = source.width / source.height;
    const placedRatio = fg.width / fg.height;
    assert.ok(Math.abs(originalRatio - placedRatio) < 0.01);
  });

  it('correctly maps 1:1 square to 16:9 canvas without cropping', () => {
    const source = { width: 1000, height: 1000 }; // 1:1
    const fg = calculateForegroundPlacement(source, TARGET_16_9);

    assert.strictEqual(fg.height, 900);
    assert.strictEqual(fg.width, 900);
    assert.strictEqual(fg.x, 350);
    assert.strictEqual(fg.y, 0);
  });

  it('correctly maps 16:9 landscape to 7:5 mobile canvas without cropping', () => {
    const source = { width: 1920, height: 1080 }; // 16:9
    const fg = calculateForegroundPlacement(source, TARGET_7_5);

    assert.strictEqual(fg.width, 1050);
    assert.strictEqual(fg.height, Math.round(1080 * (1050 / 1920))); // 591
    assert.strictEqual(fg.x, 0);
    assert.strictEqual(fg.y, Math.round((750 - fg.height) / 2));

    const originalRatio = source.width / source.height;
    const placedRatio = fg.width / fg.height;
    assert.ok(Math.abs(originalRatio - placedRatio) < 0.01);
  });

  it('correctly maps 4:5 portrait to 7:5 mobile canvas without cropping', () => {
    const source = { width: 1000, height: 1250 }; // 4:5
    const fg = calculateForegroundPlacement(source, TARGET_7_5);

    assert.strictEqual(fg.height, 750);
    assert.strictEqual(fg.width, Math.round(1000 * (750 / 1250))); // 600
    assert.strictEqual(fg.x, Math.round((1050 - fg.width) / 2));
    assert.strictEqual(fg.y, 0);
  });
});
