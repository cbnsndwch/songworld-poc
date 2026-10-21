"""Run the real Hunyuan3D 2.1 shape and PBR paint pipelines. Never fabricate outputs."""
import gc
import json
import os
import struct
import sys
from pathlib import Path

def validate_glb(filename):
    data = Path(filename).read_bytes()
    if len(data) < 100 or data[:4] != b'glTF' or struct.unpack_from('<II', data, 4) != (2, len(data)):
        raise RuntimeError(f'Incomplete GLB: {filename}')
    size, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4e4f534a:
        raise RuntimeError(f'Missing GLB JSON: {filename}')
    document = json.loads(data[20:20 + size])
    if not document.get('meshes') or not document.get('materials') or not document.get('images'):
        raise RuntimeError(f'Missing textured mesh: {filename}')
    if any('uri' in image for image in document['images']):
        raise RuntimeError(f'GLB textures must be embedded: {filename}')

job = json.loads(Path(sys.argv[1]).read_text())
if all(Path(item['glb']).exists() for item in job['items']):
    for item in job['items']:
        validate_glb(item['glb'])
    print('Validated cached Hunyuan GLBs; no GPU pipeline needed.', flush=True)
    sys.exit(0)

import torch
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = Path.cwd()
sys.path[:0] = [str(source / 'hy3dshape'), str(source / 'hy3dpaint')]
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
from hy3dshape.rembg import BackgroundRemover
from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline

shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1')
remove_background = BackgroundRemover()
for item in job['items']:
    mesh_path = Path(item['mesh'])
    if mesh_path.exists() or Path(item['glb']).exists():
        continue
    reference = remove_background(Image.open(item['image']).convert('RGB'))
    reference.save(str(mesh_path.with_suffix('.png')))
    mesh = shape(image=reference, generator=torch.Generator('cuda').manual_seed(item['seed']))[0]
    mesh.export(str(mesh_path))
del shape
gc.collect()
torch.cuda.empty_cache()
config = Hunyuan3DPaintConfig(max_num_view=6, resolution=512)
config.realesrgan_ckpt_path = str(source / 'hy3dpaint/ckpt/RealESRGAN_x4plus.pth')
paint = Hunyuan3DPaintPipeline(config)
for item in job['items']:
    if Path(item['glb']).exists():
        continue
    paint(mesh_path=item['mesh'], image_path=item['image'], output_mesh_path=str(Path(item['glb']).with_suffix('.obj')), save_glb=True)
    validate_glb(item['glb'])

for item in job['items']:
    validate_glb(item['glb'])
torch.cuda.synchronize()
print('All textured Hunyuan GLBs exported and validated.', flush=True)
sys.stderr.flush()
# bpy 4.2 in this headless Python environment segfaults during interpreter
# teardown after a successful export. Exit only after every output validates;
# inference/export exceptions above still propagate as failures.
os._exit(0)
