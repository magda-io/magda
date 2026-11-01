#!/bin/sh
set -eu

# Test hooks point at fixture paths without changing production behavior.
cgroup_root="${MAGDA_WORKSPACE_CGROUP_ROOT:-/sys/fs/cgroup}"
data_path="${MAGDA_WORKSPACE_DATA_PATH:-/data}"

cpu_max_file="$cgroup_root/cpu.max"
memory_max_file="$cgroup_root/memory.max"
memory_current_file="$cgroup_root/memory.current"

configured_cpu="${MAGDA_WORKSPACE_CPU_LIMIT:-unknown}"
configured_memory="${MAGDA_WORKSPACE_MEMORY_LIMIT:-unknown}"
requested_storage="${MAGDA_WORKSPACE_STORAGE_SIZE:-unknown}"

format_bytes() {
    awk -v bytes="$1" 'BEGIN {
        gib = 1024 * 1024 * 1024
        mib = 1024 * 1024
        if (bytes >= gib) printf "%.2f GiB", bytes / gib
        else printf "%.2f MiB", bytes / mib
    }'
}

printf 'Configured CPU limit: %s\n' "$configured_cpu"
if [ -r "$cpu_max_file" ]; then
    cpu_quota=""
    cpu_period=""
    if read -r cpu_quota cpu_period < "$cpu_max_file"; then :; fi
    if [ "$cpu_quota" = "max" ]; then
        printf 'Container cgroup CPU limit: unlimited\n'
    elif [ "$cpu_quota" -ge 0 ] 2>/dev/null && \
        [ "${cpu_period:-0}" -gt 0 ] 2>/dev/null; then
        cgroup_cpu="$(awk -v quota="$cpu_quota" -v period="$cpu_period" 'BEGIN {
            value = quota / period
            if (value == int(value)) {
                printf "%d", value
            } else {
                text = sprintf("%.3f", value)
                sub(/0+$/, "", text)
                sub(/\.$/, "", text)
                printf "%s", text
            }
        }')"
        printf 'Container cgroup CPU limit: %s CPU\n' "$cgroup_cpu"
    else
        printf 'Container cgroup CPU limit: unavailable (invalid cpu.max)\n'
    fi
else
    printf 'Container cgroup CPU limit: unavailable (no cgroup v2 cpu.max)\n'
fi

printf 'Configured memory limit: %s\n' "$configured_memory"
if [ -r "$memory_max_file" ]; then
    memory_max="$(cat "$memory_max_file")"
    if [ "$memory_max" = "max" ]; then
        printf 'Container cgroup memory limit: unlimited\n'
    elif [ "$memory_max" -ge 0 ] 2>/dev/null; then
        printf 'Container cgroup memory limit: %s (%s bytes)\n' \
            "$(format_bytes "$memory_max")" "$memory_max"
    else
        printf 'Container cgroup memory limit: unavailable (invalid memory.max)\n'
    fi
else
    printf 'Container cgroup memory limit: unavailable (no cgroup v2 memory.max)\n'
fi

if [ -r "$memory_current_file" ]; then
    memory_current="$(cat "$memory_current_file")"
    if [ "$memory_current" -ge 0 ] 2>/dev/null; then
        printf 'Current cgroup memory use: %s (%s bytes)\n' \
            "$(format_bytes "$memory_current")" "$memory_current"
    else
        printf 'Current cgroup memory use: unavailable (invalid memory.current)\n'
    fi
else
    printf 'Current cgroup memory use: unavailable (no cgroup v2 memory.current)\n'
fi

printf 'Requested PVC size: %s\n' "$requested_storage"
printf 'Observed /data filesystem:\n'
df -hP "$data_path"
printf '%s\n' \
    'Storage note: this is the size requested for a fresh PVC from the current' \
    'Sandbox template, not a guaranteed quota. Existing or warm claims may differ,' \
    'and development StorageClasses such as Minikube hostpath may show node disk' \
    'capacity above instead of enforcing the requested claim size.'
