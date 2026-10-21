# GPU setup and real model runtime

The connected VM has one H200, about 141 GB VRAM, Ubuntu 24.04 and passwordless sudo. The official PyTorch 2.7.1 CUDA 12.8 development container runs as `songworld-models`; `/home/ubuntu/songworld` is mounted at `/workspace`. Host Docker commands require `sudo -n`. Nothing here creates a VM or invokes Tencent cloud inference.

Verified: CUDA matmul, native Hunyuan rasterizer/painter builds, original Z-Image reference generation, Hunyuan3D 2.1 shape and PBR export, cached GLB recovery and local game rendering. The first jungle arch has 42,436 vertices and embedded textures. Blender 4.2 segfaulted at interpreter shutdown after export; the worker now validates every output before explicit process exit, and cached recovery avoids loading GPU pipelines.

Nemotron returned HTTP 200 for a real story request, but its first verification artifact was lost when GPU sleep exceeded the old timeout. The adapter now saves plans before cleanup. A real ACE-Step 75-second instrumental benchmark completed and was downloaded locally. HY World 2.0 WorldMirror reconstruction produced depth, normals, camera parameters and a point cloud from one image. Full world generation, full 24 biome banks and playable tile validation remain incomplete.

## Hardware telemetry

`monitor-hardware.py` runs on the VM host and appends a JSON sample every two seconds to `logs/hardware.jsonl`: GPU memory, compute and memory-controller utilization, power, temperature, GPU process IDs, CPU utilization and system RAM. `logs/gpu-stage.txt` labels the current workload. Samples may miss short peaks; host VRAM includes every process and is different from PyTorch allocated memory. It is not a benchmark of smaller GPUs.

Download the log with `scp nebius-gpu-vm:./songworld/logs/hardware.jsonl artifacts/hardware.jsonl`, then run `node scripts/hardware-report.mjs`. Stop the monitor by its inspected process ID when monitoring is no longer needed.

Observed before continuous telemetry: Nemotron FP8 weights occupied 114.12 GiB, awake GPU memory reached 136,135 MiB with the initial cache allocation, and sleep took 684 seconds while backing weights into host RAM. After stopping that service, host RAM fell from roughly 181 GiB used to 6–7 GiB. Avoid treating that offload configuration as an efficient small-GPU deployment. ACE-Step's first 75-second benchmark logged a PyTorch peak allocation of 6.27 GB; host process usage and sampled device peaks are recorded separately.

## Connection

Create the SSH profile `nebius-gpu-vm`. Use a Linux GPU image with CUDA 12.8 or newer, a compiler/toolkit, and persistent storage for weights and outputs. Run the preflight before model downloads. Keep the instance off until ready to connect.

Copy this `vm` directory to `~/songworld/vm` on the instance. Install [uv](https://docs.astral.sh/uv/getting-started/installation/) if the image lacks it. Scripts use separate environments because the upstream projects have conflicting dependencies.

```bash
bash ~/songworld/vm/bootstrap.sh preflight
bash ~/songworld/vm/bootstrap.sh images
bash ~/songworld/vm/bootstrap.sh hunyuan
bash ~/songworld/vm/run-service.sh hunyuan
```

On the Windows machine, forward services over SSH:

```powershell
ssh -N -L 18000:127.0.0.1:8000 -L 18001:127.0.0.1:8001 -L 18002:127.0.0.1:8002 nebius-gpu-vm
```

Generate one arch first, before requesting an entire eight-variant bank. POST `/generate` with `{"biome":{"id":"jungle-ruins","description":"Mossy ancient jungle ruins, turquoise water and giant tropical trees"},"variants":["arch"]}`. It runs Z-Image-Turbo locally for an original reference, exits that process, runs real Hunyuan3D 2.1 shape and PBR paint, then exits to release VRAM. Workers log to the asset bank directory. Responses include prompt, seed, source commit and GLB hash. A successful process alone does not establish collision compatibility: inspect the asset in the game before accepting it as a playable tile.

The first run downloads checkpoints and compiles extensions. Actual duration and B200 compatibility remain unverified. The bootstrap uses PyTorch CUDA 12.8 in place of Hunyuan's upstream CUDA 12.4 environment for Blackwell; verify extensions and inspect errors rather than assuming it works unchanged.

## Story and soundtrack

After the first asset is verified, install each service separately:

```bash
bash ~/songworld/vm/bootstrap.sh nemotron
bash ~/songworld/vm/bootstrap.sh music
bash ~/songworld/vm/run-service.sh nemotron
# Separate terminal, after checking nvidia-smi:
bash ~/songworld/vm/run-service.sh music
```

Nemotron selects 120B-A12B FP8 on H200 and NVFP4 on Blackwell, with bounded 8K context and one active sequence. The app uses vLLM loopback sleep/wake controls when `nemotronSleep` is enabled, releasing storyteller VRAM before audio/assets. Sleep endpoints require `VLLM_SERVER_DEV_MODE=1`; never expose this service publicly. The memory fraction is a starting configuration, not proof the complete stack fits. Stop resident services before generating an asset bank if measured memory is insufficient. Download generated outputs to the local application before shutting the instance down.

## HY World 2.0 experiment

`bash ~/songworld/vm/bootstrap.sh world` prepares an isolated environment and attempts the custom gsplat and FlashAttention-2 builds from the official repository. Their B200 compatibility remains unverified. Start with the upstream WorldMirror reconstruction smoke test, then run `bash ~/songworld/vm/bootstrap.sh world-generation` for the extra Git dependencies and navmesh extension. Required checkpoints, access gates and the full generation pipeline still need verification against the actual image. Full single-B200 world generation is unproven; the official pipeline recommends multiple GPUs. Never present a reconstruction smoke test as successful end-to-end world generation.

## Official runtime references

- [Hunyuan3D 2.1 installation and pipelines](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)
- [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)
- [Nemotron 3 Super NVFP4 deployment](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4)
- [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5)
- [HY World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0)
