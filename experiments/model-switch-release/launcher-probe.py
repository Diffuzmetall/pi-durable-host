"""Exercise the exact standard launcher with disposable loopback binding in a mount sandbox."""
import argparse, fcntl, hashlib, json, os, pty, re, select, struct, subprocess, tempfile, termios, time, urllib.request
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--candidate', action='store_true')
args=parser.parse_args()
project=Path(__file__).resolve().parents[2]
release=Path('/home/ubuntu/.local/share/pi-durable-host/releases/terminal-model-skills-20261030-v1')
launcher=Path('/home/ubuntu/.local/bin/pi-durable')
root=Path(tempfile.mkdtemp(prefix='pi-durable-launcher-skills-'))
env={k:v for k,v in os.environ.items() if k in ('PATH','LANG')}
env.update(HOME=str(root), PI_CODING_AGENT_DIR=str(root/'agent'), TERM='xterm-256color', LAUNCHER_PROBE_ROOT=str(root))
log=open(root/'host.log','wb')
host=subprocess.Popen(['node','--import','tsx',str(project/'experiments/model-switch-release/launcher-fixture.mjs')],cwd=project/'apps/dpi-backend',env=env,stdout=log,stderr=log)
proc=None; master=None; output=bytearray()
ansi=re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')
def pump():
    if master is None: return
    if select.select([master],[],[],.05)[0]:
        try: output.extend(os.read(master,65536))
        except OSError: pass
def wait(predicate,label):
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        if predicate(): return
        pump()
        if host.poll() is not None: break
        if master is None: time.sleep(.02)
    raise AssertionError(label+'; evidence='+str(root)+'; tail='+ansi.sub('',output.decode(errors='replace'))[-800:])
def screen(text): return text in ansi.sub('',output.decode(errors='replace'))
def send(text): os.write(master,text.encode())
def api(path):
    request=urllib.request.Request(ready['base']+'/v1'+path,headers={'Authorization':'Bearer '+ready['token']})
    with urllib.request.urlopen(request,timeout=5) as response: return json.load(response)
try:
    wait(lambda:(root/'ready.json').exists(),'faux host startup')
    ready=json.loads((root/'ready.json').read_text())
    config=root/'client.json';config.write_text(json.dumps({'url':ready['base'],'token':ready['token']}));config.chmod(0o600)
    (root/'agent/configs').mkdir(parents=True)
    (root/'agent/configs/model-switch.json').write_text(json.dumps({'sections':{'local':['faux/echo']}}))
    cmd=['bwrap','--ro-bind','/','/','--bind',str(root),str(root),'--bind',ready['fixtureRoot'],ready['fixtureRoot'],'--dev','/dev','--proc','/proc','--unshare-user','--unshare-pid','--die-with-parent',
         '--ro-bind',str(config),'/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1/terminal-client.json',
         '--ro-bind','/bin/true','/usr/bin/systemctl']
    if args.candidate:
        candidate=root/'pi-durable.candidate';candidate.write_bytes((release/'launcher.candidate').read_bytes());candidate.chmod(0o775)
        cmd += ['--ro-bind',str(candidate),str(launcher)]
    cmd += ['--chdir',ready['cwd'],'--',str(launcher),'--session',ready['sessionId']]
    master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
    proc=subprocess.Popen(cmd,env=env,stdin=slave,stdout=slave,stderr=slave);os.close(slave)
    wait(lambda:screen('native-attention'),'standard launcher starts actual installed TUI')
    send('/model-switch\r');wait(lambda:screen('[local]'),'installed model-switch section')
    send('\x1b[27u');output.clear()
    send('$');wait(lambda:screen('Skills'),'installed dollar picker')
    send('terminal-fixture');wait(lambda:screen('matching "terminal-fixture"'),'first skill search')
    send('\r');wait(lambda:screen('/skill:terminal-fixture'),'first skill inserted')
    output.clear();send('$');wait(lambda:screen('Skills'),'repeat dollar')
    send('second');wait(lambda:screen('matching "second"'),'second skill search')
    send('\r');wait(lambda:screen('/skill:second'),'second skill inserted')
    send(' LAUNCHER_TWO_SKILLS\r')
    def bodies():
        entries=api('/sessions/'+ready['sessionId']+'/agents/1/entries?scope=all')['items']
        return [message['content'] for entry in entries if entry.get('kind')=='host.input' for message in entry.get('model',[]) if message.get('role')=='user' and isinstance(message.get('content'),str)]
    wait(lambda:any('ORIGINAL_REMOTE_SKILL_BODY' in x and 'SECOND_LAUNCHER_BODY' in x for x in bodies()),'actual Host received both skill bodies')
    body=next(x for x in bodies() if 'SECOND_LAUNCHER_BODY' in x)
    assert body.count('<skill name=')==2
    # Change resources while the same terminal and owner remain alive.
    third=Path(ready['fixtureRoot'])/'agent/skills/hot-third';third.mkdir()
    (third/'SKILL.md').write_text('---\nname: hot-third\ndescription: Hot third skill\n---\nHOT_THIRD_BODY\n')
    output.clear();send('/reload\r');wait(lambda:screen('catalogues refreshed'),'client-only hot reload')
    output.clear();send('$');send('hot-third');wait(lambda:screen('hot-third'),'new skill visible without restarting terminal/owner')
    send('\x1b[27u');send('/quit\r')
    wait(lambda:proc.poll() is not None,'clean detach');assert proc.wait()==0
    assert len(bodies())==1,'reload/cancel must not send extra requests'
    assert ready['token'].encode() not in output
    result={'pass':True,'phase':'preactivation' if args.candidate else 'active-standard-launcher','launcher':str(launcher),'launcherSha256':hashlib.sha256((release/'launcher.candidate' if args.candidate else launcher).read_bytes()).hexdigest(),
      'checks':['exact standard launcher','installed TUI','model section menu','repeat $ inserts two skills','both actual Host bodies in one input','hot /reload adds skill without owner/client restart','cancel sends nothing','clean detach'],
      'sandbox':'Only private client binding and systemctl start replaced in mount namespace; no real service call or live DB access', 'evidence':str(root)}
    print(json.dumps(result))
    (root/'result.json').write_text(json.dumps(result,indent=2)+'\n')
finally:
    if proc and proc.poll() is None: proc.terminate();proc.wait(timeout=5)
    if master is not None: os.close(master)
    host.terminate();host.wait(timeout=10);log.close()
