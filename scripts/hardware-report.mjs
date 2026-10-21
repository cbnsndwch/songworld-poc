import fs from 'node:fs/promises';
const samples = (await fs.readFile(process.argv[2] || 'artifacts/hardware.jsonl', 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(s => !s.error && s.gpus?.length);
const groups = Object.groupBy(samples, sample => sample.stage);
const report = { createdAt: new Date().toISOString(), samplingNote: 'Host nvidia-smi samples every two seconds; brief peaks may be missed. VRAM includes all processes. These measurements do not prove compatibility with another GPU.', stages: Object.entries(groups).map(([stage, rows]) => ({
  stage, samples: rows.length, first: rows[0].timestamp, last: rows.at(-1).timestamp,
  sampledPeakVRAMMiB: Math.max(...rows.map(r => r.gpus[0].vram_used_mib)),
  sampledPeakGPUPercent: Math.max(...rows.map(r => r.gpus[0].gpu_percent)),
  averageGPUPercent: rows.reduce((sum, r) => sum + r.gpus[0].gpu_percent, 0) / rows.length,
  sampledPeakPowerW: Math.max(...rows.map(r => r.gpus[0].power_w)),
  sampledPeakTemperatureC: Math.max(...rows.map(r => r.gpus[0].temperature_c)),
  sampledPeakRAMMiB: Math.max(...rows.map(r => r.ram_used_mib)),
  sampledPeakCPUPercent: Math.max(...rows.map(r => r.cpu_percent)),
})) };
await fs.writeFile('artifacts/hardware-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
