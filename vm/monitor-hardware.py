"""Low frequency host telemetry. Run once on the VM, outside the model container."""
import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--interval', type=float, default=2)
parser.add_argument('--stage-file', required=True)
args = parser.parse_args()
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)

def command(arguments):
    return subprocess.check_output(arguments, text=True, timeout=5).strip()

def cpu_times():
    values = [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    return sum(values), values[3] + values[4]

previous = cpu_times()
with output.open('a', buffering=1) as log:
    while True:
        started = time.monotonic()
        sample = {'timestamp': datetime.now(timezone.utc).isoformat()}
        try:
            sample['stage'] = Path(args.stage_file).read_text().strip()
        except FileNotFoundError:
            sample['stage'] = 'unlabeled'
        try:
            fields = 'index,name,memory.total,memory.used,utilization.gpu,utilization.memory,power.draw,power.limit,temperature.gpu'
            rows = csv.reader(command(['nvidia-smi', f'--query-gpu={fields}', '--format=csv,noheader,nounits']).splitlines())
            sample['gpus'] = []
            for row in rows:
                values = [v.strip() for v in row]
                gpu = {'index': int(values[0]), 'name': values[1]}
                for key, value in zip(['vram_total_mib', 'vram_used_mib', 'gpu_percent', 'memory_controller_percent', 'power_w', 'power_limit_w', 'temperature_c'], values[2:]):
                    try:
                        gpu[key] = float(value)
                    except ValueError:
                        gpu[key] = None
                sample['gpus'].append(gpu)
            sample['gpu_processes'] = command(['nvidia-smi', '--query-compute-apps=pid,process_name,used_gpu_memory', '--format=csv,noheader,nounits']).splitlines()
            memory = {line.split(':')[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:', 'MemAvailable:', 'SwapTotal:', 'SwapFree:'))}
            sample['ram_total_mib'] = memory['MemTotal'] / 1024
            sample['ram_available_mib'] = memory['MemAvailable'] / 1024
            sample['ram_used_mib'] = (memory['MemTotal'] - memory['MemAvailable']) / 1024
            current = cpu_times()
            elapsed = current[0] - previous[0]
            sample['cpu_percent'] = 100 * (1 - (current[1] - previous[1]) / elapsed) if elapsed else 0
            previous = current
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            sample['error'] = str(error)
        log.write(json.dumps(sample) + '\n')
        time.sleep(max(.1, max(1, args.interval) - (time.monotonic() - started)))
