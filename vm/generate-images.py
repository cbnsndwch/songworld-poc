"""Generate original object reference images locally; separate dependency environment."""
import json
import sys
from pathlib import Path
job = json.loads(Path(sys.argv[1]).read_text())
if all(Path(item['image']).exists() for item in job['items']):
    print('Reference images cached; no GPU pipeline needed.', flush=True)
    sys.exit(0)
import torch
from diffusers import ZImagePipeline

pipe = ZImagePipeline.from_pretrained('Tongyi-MAI/Z-Image-Turbo', torch_dtype=torch.bfloat16, low_cpu_mem_usage=False).to('cuda')
for item in job['items']:
    target = Path(item['image'])
    if target.exists():
        continue
    target.parent.mkdir(parents=True, exist_ok=True)
    image = pipe(prompt=item['prompt'], height=1024, width=1024, num_inference_steps=9, guidance_scale=0.0, generator=torch.Generator('cuda').manual_seed(item['seed'])).images[0]
    image.save(target)
