"""Loopback-only Hunyuan gateway. Generated GLBs persist; GPU workers exit per batch."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(os.environ.get('SONGWORLD_ROOT', Path.home() / 'songworld')).resolve()
ASSETS = ROOT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
VERSION = 'hunyuan21-pbr-v1'
VARIANTS = {'garden', 'terraces', 'arch', 'tower', 'grove', 'ruins', 'pond', 'sanctuary'}
LOCK = threading.Lock()
app = FastAPI(title='Songworld local Hunyuan asset gateway')
app.mount('/assets', StaticFiles(directory=ASSETS), name='assets')

class Generation(BaseModel):
    biome: dict
    variants: list[str] = Field(default_factory=lambda: ['arch'])
    tileSize: float = 12
    # Track-specific text is accepted but deliberately excluded from reusable asset prompts.
    prompt: str = ''
    palette: list[str] = Field(default_factory=list)
    requirements: str = ''

@app.get('/health')
def health():
    return {'service': 'hunyuan', 'model': 'tencent/Hunyuan3D-2.1', 'installed': (ROOT / 'envs/hunyuan/bin/python').exists(), 'busy': LOCK.locked(), 'inferenceVerified': any(ASSETS.glob(f'*/{VERSION}/manifest.json'))}

def run_worker(env, script, job, cwd, log):
    with log.open('a') as output:
        subprocess.run([str(ROOT / f'envs/{env}/bin/python'), str(ROOT / f'vm/{script}'), str(job)], cwd=cwd, stdout=output, stderr=subprocess.STDOUT, check=True)

@app.post('/generate')
def generate(body: Generation, request: Request):
    biome_id = str(body.biome.get('id', ''))
    if not biome_id or len(biome_id) > 64 or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in biome_id):
        raise HTTPException(400, 'Invalid biome ID')
    variants = list(dict.fromkeys(body.variants))
    if not variants or any(v not in VARIANTS for v in variants):
        raise HTTPException(400, 'Unsupported tile variant')
    # Bounded serial worker: never let two HTTP requests load duplicate GPU pipelines.
    if not LOCK.acquire(blocking=False):
        raise HTTPException(409, 'Asset worker is busy. Retry after the current bank completes.')
    try:
        folder = ASSETS / biome_id / VERSION
        folder.mkdir(parents=True, exist_ok=True)
        manifest_path = folder / 'manifest.json'
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'model': 'tencent/Hunyuan3D-2.1', 'provenance': {'checkpoint': 'tencent/Hunyuan3D-2.1', 'referenceModel': 'Tongyi-MAI/Z-Image-Turbo', 'bankVersion': VERSION, 'createdAt': datetime.now(timezone.utc).isoformat()}, 'tiles': []}
        existing = {t['variant'] for t in manifest['tiles'] if (folder / f"{t['variant']}.glb").exists()}
        items = []
        for variant in variants:
            if variant in existing:
                continue
            seed = int.from_bytes(hashlib.sha256(f'{VERSION}/{biome_id}/{variant}'.encode()).digest()[:4], 'big')
            prompt = f"High quality stylized 3D game environment asset, {body.biome.get('description', biome_id)}. A single cohesive {variant} module on a small rocky island, readable playful sculpted shapes, detailed PBR stone and vegetation, whole object visible, isometric three-quarter view, neutral white background, no text, no people, no cropped geometry."
            items.append({'variant': variant, 'seed': seed, 'prompt': prompt, 'image': str(folder / f'{variant}.png'), 'mesh': str(folder / f'{variant}-shape.obj'), 'glb': str(folder / f'{variant}.glb')})
        if items:
            job = folder / 'job.json'
            job.write_text(json.dumps({'items': items}, indent=2))
            log = folder / 'generation.log'
            run_worker('images', 'generate-images.py', job, ROOT, log)
            run_worker('hunyuan', 'generate-meshes.py', job, ROOT / 'src/Hunyuan3D-2.1', log)
            revision = subprocess.check_output(['git', '-C', str(ROOT / 'src/Hunyuan3D-2.1'), 'rev-parse', 'HEAD'], text=True).strip()
            for item in items:
                manifest['tiles'] = [t for t in manifest['tiles'] if t['variant'] != item['variant']]
                manifest['tiles'].append({'variant': item['variant'], 'file': f"{item['variant']}.glb", 'seed': item['seed'], 'prompt': item['prompt'], 'sha256': hashlib.sha256(Path(item['glb']).read_bytes()).hexdigest(), 'collisionValidated': False})
            manifest['provenance']['sourceRevision'] = revision
            temporary = folder / 'manifest.tmp'
            temporary.write_text(json.dumps(manifest, indent=2))
            temporary.replace(manifest_path)
        origin = str(request.base_url).rstrip('/')
        result = {**manifest, 'tiles': [{**t, 'glbUrl': f"{origin}/assets/{biome_id}/{VERSION}/{t['file']}"} for t in manifest['tiles']]}
        result['collisionValidated'] = False
        return result
    except subprocess.CalledProcessError as error:
        raise HTTPException(500, f'Model worker failed (exit {error.returncode}); inspect assets/{biome_id}/{VERSION}/generation.log') from error
    finally:
        LOCK.release()
