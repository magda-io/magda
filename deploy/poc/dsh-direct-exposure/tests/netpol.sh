#!/usr/bin/env bash
# #3841 Experiment 2/5B: who can reach DSH :3080 on the Sandbox Services.
# Prints one line per (peer -> sandbox) with DSH's HTTP status (any status =
# reached DSH; the probe sends GET to a POST route, so 404) or BLOCKED.
set -uo pipefail
NS=magda-agent-poc
SBX=($(kubectl -n $NS get sandbox -o jsonpath='{range .items[*]}{.status.serviceFQDN}{" "}{end}'))
probe() { # <label> <namespace> <exec target> <container>
  for t in "${SBX[@]}"; do
    r=$(kubectl -n "$2" exec "$3" -c "$4" -- node -e "
      const s=require('net').connect(3080,'$t');s.setTimeout(4000);
      s.on('connect',()=>{s.end('GET /api/session/list HTTP/1.1\r\nHost: 127.0.0.1:3080\r\nConnection: close\r\n\r\n')});
      let b='';s.on('data',d=>b+=d);s.on('end',()=>{console.log(b.split(' ')[1]||'?')});
      s.on('timeout',()=>{console.log('BLOCKED(timeout)');s.destroy()});s.on('error',e=>console.log('BLOCKED('+e.code+')'))" 2>&1)
    note=""; [[ "$t" == "${3#pod/}."* ]] && note=" (own Service: hairpin, NetworkPolicy never applies to self)"
    printf '%-34s -> %-58s %s%s\n' "$1" "$t" "$r" "$note"
  done
}
probe "agent-manager (allowed)" $NS deploy/agent-manager agent-manager
probe "mock-llm (same ns, other label)" $NS deploy/mock-llm mock-llm
probe "magda gateway (other ns)" magda deploy/gateway gateway
for s in $(kubectl -n $NS get pod -l app.kubernetes.io/name=magda-agent-sandbox -o name); do
  probe "sandbox ${s#pod/}" $NS "$s" agent
done
