#!/usr/bin/env node
/* Run locally: node magda-llm-services/poc/cluster-dsh.cjs
 * Uses only existing pods and an isolated /tmp/magda3934-* directory in the DSH
 * sandbox. No existing profile/workspace changes. An ephemeral JWT transits
 * only process memory/stdin; no credentials or model bodies are printed.
 * Real installed DSH headless runs real provider requests through MAGDA facade.
 */
process.on("uncaughtException", (e) => {
    console.log(
        JSON.stringify({
            case: "launcher-error",
            errorName: ["Error", "TypeError", "SyntaxError"].includes(e.name)
                ? e.name
                : "other"
        })
    );
    process.exitCode = 1;
});
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs"),
    path = require("node:path");
const observed = process.argv.includes("--observed");
const context = execFileSync("kubectl", ["config", "current-context"], {
    encoding: "utf8"
}).trim();
if (context !== "minikube")
    throw new Error("Refusing experiment outside minikube");
const observerSource = observed
    ? require("typescript").transpileModule(
          fs.readFileSync(path.join(__dirname, "usage-observer.ts"), "utf8"),
          {
              compilerOptions: {
                  target: require("typescript").ScriptTarget.ES2022,
                  module: require("typescript").ModuleKind.CommonJS
              }
          }
      ).outputText
    : "";
const namespace = "magda-demo";
const pods = JSON.parse(
    execFileSync(
        "kubectl",
        ["--context", "minikube", "get", "pods", "-n", namespace, "-o", "json"],
        { encoding: "utf8" }
    )
);
const facade = pods.items.find((p) =>
    p.metadata.name.startsWith("llm-services-")
).metadata.name;
const sandboxes = JSON.parse(
    execFileSync(
        "kubectl",
        [
            "--context",
            "minikube",
            "get",
            "pods",
            "-n",
            "magda-demo-agent",
            "-o",
            "json"
        ],
        { encoding: "utf8" }
    )
);
const sandbox = sandboxes.items.find((p) => p.status.phase === "Running")
    .metadata.name;
const mint = `const jwt=require('jsonwebtoken');process.stdout.write(jwt.sign({userId:'00000000-0000-4000-8000-000000000000'},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'10m'}))`;
const token = execFileSync(
    "kubectl",
    [
        "--context",
        "minikube",
        "exec",
        "-n",
        namespace,
        facade,
        "--",
        "node",
        "-e",
        mint
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
);
const remote = String.raw`
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const input=JSON.parse(fs.readFileSync(0,'utf8'));const root=fs.mkdtempSync('/tmp/magda3934-');const workspace=path.join(root,'workspace');fs.mkdirSync(workspace);
const report=x=>console.log(JSON.stringify(x));const model='magda-agent-default';let server;let createObserver;
if(input.observerSource){const module={exports:{}};new Function('module','exports','require',input.observerSource)(module,module.exports,require);createObserver=module.exports.createUsageObserver;}
(async()=>{
server=http.createServer((req,res)=>{let body=[];let n=0;req.on('data',b=>{n+=b.length;if(n>2*1024*1024)req.destroy();else body.push(b)});req.on('end',()=>{const bytes=Buffer.concat(body);let b;try{b=JSON.parse(bytes)}catch{b={}};report({case:'dsh-wire-request',path:['/v1/chat/completions','/v1/responses'].includes(req.url)?req.url:'other',model:b.model===model?model:'other',stream:b.stream===true,includeUsage:b.stream_options?.include_usage??'absent',messages:Array.isArray(b.messages)?b.messages.length:undefined,inputItems:Array.isArray(b.input)?b.input.length:undefined,toolDefinitions:Array.isArray(b.tools)?b.tools.length:0,toolResultMessages:Array.isArray(b.messages)?b.messages.filter(x=>x.role==='tool').length:undefined,toolResultItems:Array.isArray(b.input)?b.input.filter(x=>x.type==='function_call_output').length:undefined});const upstream=http.request({hostname:'llm-services.magda-demo.svc.cluster.local',port:80,path:'/v0'+req.url,method:req.method,headers:{'content-type':'application/json','X-Magda-Session':input.token,'content-length':bytes.length}},r=>{report({case:'dsh-wire-status',status:r.statusCode});res.writeHead(r.statusCode,{'content-type':r.headers['content-type']||'application/json'});if(createObserver){const observer=createObserver({format:(r.headers['content-type']||'').includes('event-stream')?'sse':'json'});const crypto=require('node:crypto'),before=crypto.createHash('sha256'),after=crypto.createHash('sha256');r.on('data',chunk=>{before.update(chunk);observer.write(chunk);after.update(chunk)});r.on('end',()=>report({case:'dsh-observation',observation:observer.finish(),bytesUnchanged:before.digest('hex')===after.digest('hex')}));}r.pipe(res)});upstream.on('error',()=>{report({case:'dsh-wire-error',kind:'connection'});res.writeHead(502);res.end()});res.on('close',()=>{if(!res.writableEnded)upstream.destroy()});upstream.end(bytes)})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const yaml=require('/usr/local/lib/node_modules/js-yaml');
for(const api of input.observerSource?['openai-responses']:['openai-completions','openai-responses']){
const home=path.join(root,api);fs.mkdirSync(home);const patch=path.join(home,'patch.yml');
const patches=[{id:'agent-default-model',config:{provider:'poc',model}},{id:'llm-pi-ai',config:{providers:{poc:{api,baseURL:'http://127.0.0.1:'+server.address().port+'/v1',apiKeyEnv:'POC_UNUSED_KEY',models:[{id:model,contextWindow:131072,maxTokens:1024,reasoningEfforts:false,input:['text']}],...(api==='openai-completions'?{compat:{maxTokensField:'max_completion_tokens',supportsUsageInStreaming:true,supportsReasoningEffort:false,supportsStore:false}}:{}),retryPolicy:{mode:'normal',maxRetries:0}}}}}];fs.writeFileSync(patch,yaml.dump(patches));
for(const task of ['Say OK.','Do not read any files or environment variables. Use bash exactly once to execute printf 2, then reply OK.']){
const meta={case:'dsh-headless',api,toolTask:task.startsWith('Do not'),stdoutLines:0,jsonLines:0,stderrBytes:0,eventCounts:{},timedOut:false,diagnosticFlags:{}};const diagnose=s=>{for(const term of ['NO_ADAPTER','AUTH','INVALID_CONFIG','INVALID_REQUEST','MODEL_NOT_FOUND','NO_MODEL','apiKey','retryPolicy','disabled','invalid','credential','not found','NO_PROVIDER','configuration','NO_DEFAULT_MODEL','UNKNOWN_MODEL','ECONNREFUSED','ENOTFOUND'])if(s.includes(term))meta.diagnosticFlags[term]=true};
await new Promise(resolve=>{const child=spawn('/usr/local/bin/dsh',['--profile','headless','--patch',patch,'--json',task],{cwd:workspace,env:{...process.env,DSH_HOME:home,DSH_PERMISSION_MODE:'workspace-write',DSH_TELEMETRY_DISABLED:'1',POC_UNUSED_KEY:'poc-placeholder'}});let pending='';let killTimer;const timer=setTimeout(()=>{meta.timedOut=true;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000)},180000);child.stdout.on('data',b=>{pending+=b.toString();if(pending.length>2*1024*1024){meta.outputLimit=true;child.kill('SIGTERM');return}let i;while((i=pending.indexOf('\n'))!==-1){const line=pending.slice(0,i);pending=pending.slice(i+1);meta.stdoutLines++;diagnose(line);try{const e=JSON.parse(line);meta.jsonLines++;const type=['session','message','assistant','assistant_delta','tool_call','tool_result','finish','error','done','run_started','run_finished'].includes(e.type)?e.type:'other';meta.eventCounts[type]=(meta.eventCounts[type]||0)+1}catch{}}});child.stderr.on('data',b=>{meta.stderrBytes+=b.length;diagnose(b.toString())});child.on('close',(code,signal)=>{clearTimeout(timer);clearTimeout(killTimer);meta.exitCode=code;meta.signal=signal;report(meta);resolve()});child.on('error',()=>{clearTimeout(timer);meta.spawnError=true;report(meta);resolve()})});
}
}
})().catch(e=>report({case:'dsh-fatal',errorName:e.name})).finally(()=>{if(server)server.closeAllConnections();if(server)server.close();const real=fs.realpathSync(root);if(real.startsWith('/tmp/magda3934-')&&path.dirname(real)==='/tmp'){fs.rmSync(real,{recursive:true,force:true});report({case:'dsh-cleanup',removed:true})}else report({case:'dsh-cleanup',removed:false})});
`;
const result = spawnSync(
    "kubectl",
    [
        "--context",
        "minikube",
        "exec",
        "-i",
        "-n",
        "magda-demo-agent",
        sandbox,
        "--",
        "node",
        "-e",
        remote
    ],
    {
        input: JSON.stringify({ token, observerSource }),
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 16 * 60 * 1000
    }
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr)
    console.log(
        JSON.stringify({
            case: "kubectl-stderr",
            bytes: Buffer.byteLength(result.stderr)
        })
    );
if (result.error)
    console.log(
        JSON.stringify({ case: "kubectl-error", errorName: result.error.name })
    );
process.exitCode = result.status ?? 1;
