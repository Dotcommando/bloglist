export const snippetWorkerRunner = String.raw`
const { parentPort } = require('node:worker_threads');
const vm = require('node:vm');
let current = null;
const finish = (job, message) => {
  if (current !== job) return;
  current = null;
  parentPort.postMessage({ jobId: job.id, ...message });
};
const evaluate = (job, source) => vm.runInContext(source, job.realm, { timeout: 1000 });
const drain = job => {
  if (current !== job) return;
  try {
    const state = JSON.parse(evaluate(job,
      'JSON.stringify({result:__result,failed:__failed,outgoing:__outgoing.splice(0),pending:__waiting.size,cacheable:__cacheable})'));
    if (state.outgoing.length > 2048) throw new Error();
    for (const value of state.outgoing) {
      if (Buffer.byteLength(value) > 2097152) throw new Error();
      parentPort.postMessage({ jobId: job.id, kind: 'bridge', ...JSON.parse(value) });
    }
    if (state.failed) return finish(job, { kind: 'failed' });
    if (state.result !== null) {
      if (typeof state.result !== 'string' || Buffer.byteLength(state.result) > 2097152) throw new Error();
      return finish(job, { kind: 'result', value: state.result, cacheable: state.cacheable, reusable: state.pending === 0 });
    }
  } catch { finish(job, { kind: 'failed' }); }
};
parentPort.on('message', message => {
  if (message.kind === 'execute') {
    if (current) throw new Error('Worker protocol violation');
    const job = { id: message.jobId, sandbox: Object.create(null), realm: null };
    current = job;
    try {
      job.sandbox.__data = message.data;
      job.realm = vm.createContext(job.sandbox, {
        codeGeneration: { strings: false, wasm: false },
        microtaskMode: 'afterEvaluate',
      });
      const bootstrap = 'globalThis.__result=null; globalThis.__failed=false; globalThis.__cacheable=true; globalThis.__outgoing=[]; '
        + 'globalThis.__waiting=new Map(); let __callId=0; '
        + '(async () => { const {input,context}=JSON.parse(__data); '
        + 'const proxy=path=>new Proxy(()=>{}, {get:(_,name)=> '
        + 'typeof name!=="string" || ["then","constructor","prototype","__proto__"].includes(name) ? undefined : proxy([...path,name]), '
        + 'apply:(_,__,args)=>new Promise((resolve,reject)=> { const id=++__callId; '
        + '__waiting.set(id,{resolve,reject}); __outgoing.push(JSON.stringify({id,path,input:args[0]??{}})); })}); '
        + 'const cms=proxy([]); context.cms=cms; context.cache={bypass:()=>{__cacheable=false;}}; '
        + message.code + '; return JSON.stringify(await __snippet(input,context)); })()'
        + '.then(value=> {__result=value;},()=> {__failed=true;});';
      parentPort.postMessage({ jobId: job.id, kind: 'started' });
      evaluate(job, bootstrap);
      drain(job);
    } catch { finish(job, { kind: 'failed' }); }
  } else if (message.kind === 'reply' && current && current.id === message.jobId) {
    const job = current;
    try {
      job.sandbox.__reply = JSON.stringify(message);
      evaluate(job, '(() => { const reply=JSON.parse(__reply); const pending=__waiting.get(reply.id); '
        + 'if(pending) { __waiting.delete(reply.id); if(reply.failed) { const error=new Error(reply.message); '
        + 'error.code=reply.code; pending.reject(error); } else pending.resolve(reply.value); } })()');
      drain(job);
    } catch { finish(job, { kind: 'failed' }); }
  }
});
`;
