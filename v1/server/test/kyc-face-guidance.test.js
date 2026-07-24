import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeKycFace } from '../../client/src/kycFaceGuidance.js';

function face({ centerX = 0.5, centerY = 0.45, width = 0.32, height = 0.44, roll = 0 } = {}) {
  const minX = centerX - (width / 2);
  const maxX = centerX + (width / 2);
  const minY = centerY - (height / 2);
  const maxY = centerY + (height / 2);
  const landmarks = Array.from({ length: 478 }, () => ({ x: centerX, y: centerY }));
  landmarks[0] = { x: minX, y: minY };
  landmarks[1] = { x: maxX, y: maxY };
  landmarks[33] = { x: centerX - 0.08, y: centerY - 0.04 };
  landmarks[263] = {
    x: centerX + 0.08,
    y: centerY - 0.04 + (Math.tan(roll * Math.PI / 180) * 0.16),
  };
  return landmarks;
}

function detect(faces = []) {
  return { faceLandmarks: faces };
}

test('KYC face guidance rejects absent or multiple faces', () => {
  assert.equal(analyzeKycFace(detect(), 128), 'noFace');
  assert.equal(analyzeKycFace(detect([face(), face()]), 128), 'multiple');
});

test('KYC face guidance checks lighting before framing', () => {
  assert.equal(analyzeKycFace(detect([face()]), 30), 'light');
  assert.equal(analyzeKycFace(detect([face()]), 245), 'tooBright');
});

test('KYC face guidance gives distance and position directions', () => {
  assert.equal(analyzeKycFace(detect([face({ width: 0.12, height: 0.2 })]), 128), 'closer');
  assert.equal(analyzeKycFace(detect([face({ width: 0.7, height: 0.84 })]), 128), 'back');
  assert.equal(analyzeKycFace(detect([face({ centerX: 0.25 })]), 128), 'center');
  assert.equal(analyzeKycFace(detect([face({ centerY: 0.7 })]), 128), 'higher');
  assert.equal(analyzeKycFace(detect([face({ centerY: 0.2 })]), 128), 'lower');
});

test('KYC face guidance checks head roll and accepts a valid pose', () => {
  assert.equal(analyzeKycFace(detect([face({ roll: 16 })]), 128), 'straight');
  assert.equal(analyzeKycFace(detect([face()]), 128), 'good');
});
