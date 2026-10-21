#!/usr/bin/env bash
set -Eeuo pipefail
export SONGWORLD_ROOT="${SONGWORLD_ROOT:-$HOME/songworld}"
export HF_HOME="${HF_HOME:-$SONGWORLD_ROOT/cache/huggingface}"
case "${1:-}" in
  hunyuan)
    cd "$SONGWORLD_ROOT/src/Hunyuan3D-2.1"
    exec "$SONGWORLD_ROOT/envs/hunyuan/bin/python" -m uvicorn gateway:app --app-dir "$SONGWORLD_ROOT/vm" --host 127.0.0.1 --port 8002
    ;;
  nemotron)
    # vLLM exposes sleep/wake only in dev mode. This API stays loopback-only.
    export VLLM_SERVER_DEV_MODE=1
    # This FP8 checkpoint uses CUTLASS linear + Triton MoE. The bundled
    # DeepGEMM lacks the alignment API expected by vLLM 0.20's warmup.
    export VLLM_USE_DEEP_GEMM=0 VLLM_MOE_USE_DEEP_GEMM=0 VLLM_DEEP_GEMM_WARMUP=skip
    if [[ "$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -n 1)" == 9.* ]]; then
      model="${NEMOTRON_MODEL:-nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-FP8}"
      fraction="${NEMOTRON_GPU_FRACTION:-0.94}"
    else
      model="${NEMOTRON_MODEL:-nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4}"
      fraction="${NEMOTRON_GPU_FRACTION:-0.55}"
    fi
    exec "$SONGWORLD_ROOT/envs/nemotron/bin/vllm" serve "$model" --host 127.0.0.1 --port 8000 --trust-remote-code --max-model-len 8192 --max-num-seqs 1 --gpu-memory-utilization "$fraction" --enforce-eager --moe-backend "${NEMOTRON_MOE_BACKEND:-triton}" --enable-sleep-mode --reasoning-parser-plugin "$SONGWORLD_ROOT/super_v3_reasoning_parser.py" --reasoning-parser super_v3
    ;;
  music)
    cd "$SONGWORLD_ROOT/src/ACE-Step-1.5"
    export ACESTEP_API_HOST=127.0.0.1 ACESTEP_API_PORT=8001 ACESTEP_CONFIG_PATH=acestep-v15-turbo ACESTEP_INIT_LLM=false ACESTEP_OFFLOAD_TO_CPU=true
    exec uv run acestep-api
    ;;
  *) echo 'Usage: run-service.sh hunyuan|nemotron|music'; exit 2 ;;
esac
