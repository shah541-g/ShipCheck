---
name: gvisor
description: "Use gVisor (runsc), a userspace application kernel that hardens Docker/Kubernetes containers against escape. Use when adding --runtime=runsc to Docker sandboxes, explaining software vs hardware isolation, the Sentry/Gofer architecture, or debugging syscall compatibility issues under gVisor."
---

# gVisor

> Source: gVisor docs, "What is gVisor?". **Documentation: https://gvisor.dev/docs/**. Check it for Docker/Kubernetes setup, the OCI quick start, compatibility (supported syscalls) and configuration. gVisor is one of the sandboxing approaches listed in the hackathon brief ([hackathon.md](../../instructions/hackathon.instructions.md)). Comparisons: [agent-sandbox.md](../agent-sandbox-design/references/agent-sandbox.md), [enterprise-sandboxes.md](../agent-sandbox-design/references/enterprise-sandboxes.md).

## What it is

gVisor provides a strong isolation layer between running applications and the host OS. It is an **application kernel** that implements a Linux-like interface. Unlike Linux, it is **written in Go (memory-safe)** and **runs in userspace**.

It ships an **OCI runtime called `runsc`**, which integrates with Docker and Kubernetes so sandboxed containers work with existing tooling. Three ways to use it:
- **Docker:** quickest and easiest.
- **Kubernetes:** isolate Pods with gVisor.
- **OCI quick start (`runsc` directly):** expert mode, fully customizable.

## What it does

The system interfaces normally provided by the host kernel are moved into a **separate application kernel for each sandbox**, which minimizes the risk of container escape. There are no large fixed overheads, and resource usage stays process-like.

## How it differs from other isolation approaches

gVisor is **not** a syscall filter (seccomp-bpf), **not** a wrapper over Linux isolation primitives (firejail, AppArmor), and **not** a VM in the usual sense (VirtualBox, QEMU). It takes a third approach: many of a VM's security benefits with the small footprint, fast startup and flexibility of a userspace app.

| Approach | How it works | Strengths | Weaknesses |
|---|---|---|---|
| **Machine-level virtualization** (KVM, Xen) | A VMM exposes virtualized (usually paravirtualized) hardware to a guest kernel | Great isolation, compatibility and performance | For containers it often needs extra proxies and agents; larger footprint; slower startup; nested virtualization can be tricky; hard to run densely |
| **Rule-based execution** (seccomp, SELinux, AppArmor) | Fine-grained policy enforced by hooks inside the host kernel | Native performance if the allowed surface is small | Very hard to write a reliable policy for arbitrary, unknown apps; usually combined with other layers |
| **gVisor** | Intercepts application syscalls and **acts as the guest kernel**, with no virtualized hardware ("merged guest kernel + VMM", or "**seccomp on steroids**") | Flexible footprint (threads and memory mappings, not fixed guest resources); lower fixed costs of virtualization; also applies rule-based execution for defense in depth | **Reduced app compatibility**; **higher overhead per syscall**, so syscall-heavy workloads can perform poorly |

It is similar to User Mode Linux, but UML virtualizes hardware internally and has a fixed resource footprint.

**Why Go:** strong types, bounds checks, no uninitialized variables, no use-after-free, no stack overflow, and a built-in race detector. This avoids classic kernel security bugs, at some runtime performance cost.

## Components

A gVisor sandbox is several processes that together form an environment for one or more containers.

- **`runsc`**: the entry point. Implements the OCI runtime spec, so it runs OCI bundles (a `config.json` plus a root filesystem). Commands start, stop, list and query containers.
- **Sentry** (one per sandbox): the largest component, effectively an application kernel. It implements:
  - syscalls
  - signal delivery
  - memory management and page faults
  - the threading model

  The **Platform** redirects the app's syscalls to the Sentry. The Sentry **never passes application syscalls through to the host kernel**. It makes only the host syscalls it needs for its own operation, and the app can't control them. The Sentry runs in a **restricted seccomp container with no filesystem access**.
- **Gofer** (one per container): a normal host process that **mediates all filesystem access** beyond the sandbox's internal resources (which include `/proc`, pipes, etc.). It talks to the Sentry over **9P** via a socket or shared memory, adding another layer of isolation.
- **Application:** a normal, unmodified Linux binary in an OCI bundle. Not every syscall or `/proc`/`/sys` file is implemented, so some incompatibilities may occur. See Compatibility in the docs.

## Notes for Agent Rush (my additions, not from the docs)

- **Easiest upgrade from plain Docker:** install `runsc`, register it as a Docker runtime, then run sandboxes with `docker run --runtime=runsc ...`. See the Docker guide at https://gvisor.dev/docs/ for exact install and `daemon.json` steps. Combine it with Docker's own limits (`--network none`, `--memory`, `--cpus`, `--pids-limit`, `--read-only`, `--user`) and a wall-clock timeout in the backend.
- **Doesn't need `/dev/kvm`** (in its default mode), so unlike Microsandbox it runs on any Vultr instance type.
- **Trade-off vs Microsandbox / Firecracker:**
  - gVisor's boundary is software isolation: the shared host kernel sits underneath, protected by the Sentry and seccomp.
  - MicroVMs give each sandbox its own kernel (hardware isolation).
  - For a hackathon both are credible. gVisor is simpler; microVMs make the stronger containment claim.
- **Possible snags:** syscall-heavy workloads and some tools (e.g. some browser features with Playwright/Chromium) may hit compatibility gaps. Test Pattern B early if you use gVisor.
- **Demo idea:** run `dmesg` or `uname -a` inside the sandbox; under gVisor the output shows gVisor's own kernel messages rather than the host's, which visibly proves the sandbox is isolated.

## How ShipCheck uses it (build step 1.6, and the deploy and containment skills)

**Install on the Ubuntu 24.04 VM. This is the critical checkpoint on kickoff night.**
```bash
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

- **Selected with:** `SANDBOX_RUNTIME=runsc` (production) or `runc` (dev on Windows, or the fallback). `runSandbox.js` adds `--runtime runsc` only when it is set.
- **DNS gotcha:** under `runsc` a sandbox cannot use Docker's internal DNS, so `SANDBOX_PROXY_URL` must be the proxy's **fixed IP** (`http://172.30.0.10:3128`), never the name `egress-proxy`.
- **Chromium:** the Playwright image runs as `pwuser` with `HOME=/tmp`, a `--read-only` root, `--tmpfs /tmp` and `--shm-size 512m`.
- **Fallback:** gVisor is #3 in the cut order. Switch to `SANDBOX_RUNTIME=runc` while keeping every other limit, and decide on kickoff night, not Saturday.
- **Proof:** while a demo audit runs, `docker inspect --format '{{.HostConfig.Runtime}}' shipcheck-job-...` prints `runsc`, and the report shows `Runtime: runsc`.