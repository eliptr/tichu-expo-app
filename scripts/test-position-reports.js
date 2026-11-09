const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
let stored = null;
let fail = false;
const storage = { getItem: async () => stored, setItem: async (_key, raw) => { if (fail) throw Error('quota'); stored = raw; } };
const filename = require('node:path').resolve(__dirname, '../src/features/offline/position-reports.ts');
const moduleUnderTest = new Module(filename);
moduleUnderTest.require = () => ({ __esModule: true, default: storage });
moduleUnderTest._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { capturePosition, loadPositionReports, storePositionReport, removePositionReport, exportPositionReport } = moduleUnderTest.exports;
(async () => {
  const position = { deal: { hands: { one: [{ id: 'jade-2' }] }, plays: [], botDiagnostics: { reason: 'pass' } }, handNumber: 1 };
  const before = { hands: { one: [{ id: 'jade-3' }] } };
  const report = capturePosition(position, before);
  assert.equal(report.engineVersion, 'heuristic-v2');
  const searchReport = capturePosition({
    ...position,
    deal: {
      ...position.deal,
      botDiagnostics: { engineVersion: 'ismcts-v1', search: { iterations: 64, elapsedMs: 10 } },
    },
  }, before);
  assert.equal(searchReport.engineVersion, 'ismcts-v1');
  assert.equal(JSON.parse(exportPositionReport(searchReport)).position.deal.botDiagnostics.search.iterations, 64);
  position.deal.hands.one[0].id = 'changed'; before.hands.one.length = 0;
  assert.equal(report.position.deal.hands.one[0].id, 'jade-2');
  assert.equal(report.beforeLastBotMove.hands.one.length, 1);
  assert.deepEqual(JSON.parse(exportPositionReport(report)), report);
  assert.deepEqual(await loadPositionReports(), []);
  await Promise.all([storePositionReport(report), storePositionReport({ ...report, id: 'second', engineVersion: 'heuristic-v1' })]);
  assert.deepEqual((await loadPositionReports()).map(item => item.engineVersion), ['heuristic-v1', 'heuristic-v2']);
  await storePositionReport(report);
  assert.equal((await loadPositionReports()).length, 2);
  fail = true;
  await assert.rejects(storePositionReport({ ...report, id: 'third' }));
  fail = false;
  await storePositionReport({ ...report, id: 'third' });
  await removePositionReport('second');
  assert.deepEqual((await loadPositionReports()).map(item => item.id), ['third', report.id]);
  stored = 'broken';
  await assert.rejects(storePositionReport(report));
  assert.equal(stored, 'broken');
  stored = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ ...report, id: String(i) })));
  await assert.rejects(storePositionReport(report), /full/);
  assert.equal((await loadPositionReports()).length, 50);
  console.log('PASS immutable capture, export roundtrip, concurrent saves, deduplication, quota recovery, removal, corruption preservation and capacity');
})().catch(error => { console.error(error); process.exitCode = 1; });
