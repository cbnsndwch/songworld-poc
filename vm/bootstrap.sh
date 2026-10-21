#!/usr/bin/env bash
# Run one component at a time; no services are started by installation.
set -Eeuo pipefail
export SONGWORLD_ROOT="${SONGWORLD_ROOT:-$HOME/songworld}"
export HF_HOME="${HF_HOME:-$SONGWORLD_ROOT/cache/huggingface}"
export TORCH_CUDA_ARCH_LIST="${TORCH_CUDA_ARCH_LIST:-$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -n 1)}"
mkdir -p "$SONGWORLD_ROOT"/{src,envs,logs,assets,cache}
component="${1:-preflight}"
exec > >(tee -a "$SONGWORLD_ROOT/logs/install-$component.log") 2>&1
if [[ "$component" != preflight ]]; then
  command -v uv >/dev/null || { echo 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/'; exit 1; }
fi
repo() { if [[ ! -d "$SONGWORLD_ROOT/src/$1/.git" ]]; then git clone "$2" "$SONGWORLD_ROOT/src/$1"; fi; git -C "$SONGWORLD_ROOT/src/$1" rev-parse HEAD; }
env_create() { if [[ ! -x "$SONGWORLD_ROOT/envs/$1/bin/python" ]]; then uv venv --python "$2" "$SONGWORLD_ROOT/envs/$1"; fi; }
case "$component" in
  preflight)
    nvidia-smi
    command -v nvcc && nvcc --version
    df -h "$SONGWORLD_ROOT"
    free -h
    echo 'Require a CUDA 12.8+ toolkit for B200 extension compilation. Review disk space before model downloads.'
    ;;
  images)
    env_create images 3.11
    uv pip install --python "$SONGWORLD_ROOT/envs/images/bin/python" torch torchvision --index-url https://download.pytorch.org/whl/cu128
    uv pip install --python "$SONGWORLD_ROOT/envs/images/bin/python" 'git+https://github.com/huggingface/diffusers.git' transformers accelerate sentencepiece pillow
    ;;
  hunyuan)
    repo Hunyuan3D-2.1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git
    env_create hunyuan 3.11
    export VIRTUAL_ENV="$SONGWORLD_ROOT/envs/hunyuan"
    export PATH="$VIRTUAL_ENV/bin:$PATH"
    uv pip install torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu128
    cd "$SONGWORLD_ROOT/src/Hunyuan3D-2.1"
    # Upstream bpy==4.0 is absent from PyPI; 4.2 LTS publishes Python 3.11 wheels.
    # Keep an explicit adapted requirements file so this change is auditable.
    python - <<'PY'
from pathlib import Path
text = Path('requirements.txt').read_text()
text = '\n'.join(line for line in text.splitlines() if not line.startswith('--extra-index-url'))
Path('requirements-songworld.txt').write_text(text.replace('bpy==4.0', 'bpy==4.2.0') + '\n')
PY
    uv pip install -r requirements-songworld.txt
    uv pip install setuptools wheel ninja fastapi uvicorn
    # BasicSR's removed torchvision alias has an equivalent maintained import.
    python - <<'PY'
import pathlib, site
for root in site.getsitepackages():
    path = pathlib.Path(root) / 'basicsr/data/degradations.py'
    if path.exists():
        text = path.read_text()
        path.write_text(text.replace('from torchvision.transforms.functional_tensor import rgb_to_grayscale', 'from torchvision.transforms.functional import rgb_to_grayscale'))
PY
    uv pip install --no-build-isolation -e hy3dpaint/custom_rasterizer
    (cd hy3dpaint/DifferentiableRenderer && bash compile_mesh_painter.sh)
    mkdir -p hy3dpaint/ckpt
    curl -fL --retry 3 https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -o hy3dpaint/ckpt/RealESRGAN_x4plus.pth
    ;;
  nemotron)
    env_create nemotron 3.11
    uv pip install --python "$SONGWORLD_ROOT/envs/nemotron/bin/python" vllm==0.20.0
    curl -fL --retry 3 https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/resolve/main/super_v3_reasoning_parser.py -o "$SONGWORLD_ROOT/super_v3_reasoning_parser.py"
    ;;
  music)
    repo ACE-Step-1.5 https://github.com/ace-step/ACE-Step-1.5.git
    cd "$SONGWORLD_ROOT/src/ACE-Step-1.5"
    uv sync --python 3.11
    ;;
  world)
    repo HY-World-2.0 https://github.com/Tencent-Hunyuan/HY-World-2.0.git
    env_create world 3.11
    export VIRTUAL_ENV="$SONGWORLD_ROOT/envs/world"
    export PATH="$VIRTUAL_ENV/bin:$PATH"
    cd "$SONGWORLD_ROOT/src/HY-World-2.0"
    git submodule update --init --recursive
    uv pip install torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu128
    # Official CuPy CUDA 12 wheels avoid a costly all-architecture source build.
    python - <<'PY'
from pathlib import Path
text = Path('requirements.txt').read_text()
Path('requirements-songworld.txt').write_text(text.replace('cupy==13.6.0', 'cupy-cuda12x==13.6.0'))
PY
    uv pip install -r requirements-songworld.txt
    uv pip install setuptools wheel ninja
    uv pip install --no-build-isolation -e hyworld2/worldgen/third_party/gsplat_maskgaussian
    uv pip install flash-attn --no-build-isolation
    echo 'World 2.0 reconstruction dependencies installed. Run the upstream WorldMirror smoke test before world-generation extensions; single-B200 full generation remains unverified.'
    ;;
  world-generation)
    export VIRTUAL_ENV="$SONGWORLD_ROOT/envs/world"
    export PATH="$VIRTUAL_ENV/bin:$PATH"
    cd "$SONGWORLD_ROOT/src/HY-World-2.0"
    uv pip install --no-build-isolation -r requirements_git.txt
    uv pip install --no-build-isolation ./hyworld2/worldgen/third_party/navmesh
    echo 'World-generation extensions installed. Required checkpoints, access gates and single-B200 inference still need verification.'
    ;;
  *) echo 'Usage: bootstrap.sh preflight|images|hunyuan|nemotron|music|world|world-generation'; exit 2 ;;
esac
