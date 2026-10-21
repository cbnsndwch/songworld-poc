#!/usr/bin/env bash
# Run on the VM. Uses the installed driver and a matching CUDA toolkit in isolation.
set -Eeuo pipefail
task_root="${SONGWORLD_ROOT:-$HOME/songworld}"
mkdir -p "$task_root"/{vm,logs,cache,assets}
if ! sudo -n docker container inspect songworld-models >/dev/null 2>&1; then
  sudo -n docker run -d --name songworld-models --gpus all --ipc=host --network host \
    --mount "type=bind,src=$task_root,dst=/workspace" \
    -e SONGWORLD_ROOT=/workspace -e HF_HOME=/workspace/cache/huggingface \
    pytorch/pytorch:2.7.1-cuda12.8-cudnn9-devel sleep infinity
else
  sudo -n docker start songworld-models
fi
sudo -n docker exec songworld-models bash -lc 'python --version; nvcc --version; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader'
sudo -n docker exec songworld-models bash -lc 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl build-essential libegl1 libgl1 libglib2.0-0 libxrender1 libxi6 libxkbcommon0 libsm6 libxxf86vm1 ffmpeg pkg-config libglm-dev && python -m pip install uv'
echo 'Container ready. Run model commands with: sudo docker exec songworld-models bash /workspace/vm/bootstrap.sh COMPONENT'
