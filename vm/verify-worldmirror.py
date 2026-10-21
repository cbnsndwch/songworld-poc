"""A reconstruction inference smoke test, not full world generation."""
import json
import os
from pathlib import Path
import shutil
import sys
import time
from urllib.request import urlopen

root = Path(os.environ.get('SONGWORLD_ROOT', '/workspace'))
sys.path.insert(0, str(root / 'src/HY-World-2.0'))
from hyworld2.worldrecon.pipeline import WorldMirrorPipeline

# Serialize this GPU test after the large storyteller has released its weights.
for _ in range(300):
    try:
        with urlopen('http://127.0.0.1:8000/is_sleeping', timeout=3) as response:
            if json.load(response).get('is_sleeping'):
                break
    except Exception:
        pass
    time.sleep(2)
else:
    raise RuntimeError('Nemotron has not released the GPU; leave its existing startup intact.')

inputs = root / 'assets/worldmirror-smoke-input'
inputs.mkdir(exist_ok=True)
shutil.copyfile(root / 'assets/jungle-ruins/hunyuan21-pbr-v1/arch.png', inputs / 'arch.png')
pipeline = WorldMirrorPipeline.from_pretrained('tencent/HY-World-2.0', enable_bf16=True)
result = pipeline(str(inputs), output_path=str(root / 'assets/worldmirror-smoke-output'), target_size=256, save_gs=False, save_points=True, apply_sky_mask=False, save_rendered=False)
print(f'WorldMirror reconstruction inference completed: {result}', flush=True)
