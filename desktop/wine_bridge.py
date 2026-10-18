#!/usr/bin/env python3
"""Join the existing owned Flatpak/Wine session for the read-only snapshot adapter."""
import argparse
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,required=True)
    args=parser.parse_args()
    info=args.config.stat()
    if info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)&0o077:
        raise ValueError('Private configuration required')
    config=json.loads(args.config.read_text())
    wine=config['wine']
    prefix=Path(wine['prefix']).resolve()
    state=json.loads((prefix/'launcher-process.json').read_text())
    process_stat=Path('/proc',str(state['pid']),'stat').read_text()
    start_ticks=process_stat[process_stat.rfind(')')+2:].split()[19]
    if start_ticks!=state['start_ticks']:
        raise ValueError('The terminal session is no longer running')
    output=subprocess.check_output(['flatpak','ps','--columns=instance,pid'],text=True,timeout=5)
    instances=[line.split()[0] for line in output.splitlines() if len(line.split())==2 and line.split()[1]==str(state['pid'])]
    if len(instances)!=1 or not instances[0].isdigit():
        raise ValueError('Open the configured MT5 app first')
    command=['flatpak','enter',instances[0],'env','-u','DISPLAY','WINEPREFIX='+str(prefix),'WINEDEBUG=-all',wine['runner'],wine['python'],wine['script'],'--terminal',wine['terminal'],'--output',wine['output'],'--interval','2','--bars','600','--symbol','XAUUSD','--timeframe','M15']
    if isinstance(wine.get('stopFile'),str):
        command.extend(['--stop-file',wine['stopFile']])
    child=subprocess.Popen(command,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def stop(_sig,_frame):
        if child.poll() is None:child.terminate()
    signal.signal(signal.SIGTERM,stop)
    signal.signal(signal.SIGINT,stop)
    return child.wait()

if __name__=='__main__':
    try:raise SystemExit(main())
    except (OSError,ValueError,KeyError,subprocess.SubprocessError):raise SystemExit(1)
