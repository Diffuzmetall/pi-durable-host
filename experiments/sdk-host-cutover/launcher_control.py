"""Exact-preimage replacement. A rollback changes future launches, never live owners."""
import os,stat,uuid
from pathlib import Path

def replace_launcher(path, expected, replacement, mode=0o775):
    path=Path(path);before=path.lstat()
    if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode)!=mode or path.read_bytes()!=expected:
        raise RuntimeError('Launcher preimage changed; refusing replacement')
    temporary=path.with_name(path.name+'.cutover-'+uuid.uuid4().hex)
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(replacement);stream.flush();os.fchmod(stream.fileno(),mode);os.fsync(stream.fileno())
        current=path.lstat()
        if (current.st_dev,current.st_ino,current.st_mtime_ns,current.st_size,current.st_mode)!=(before.st_dev,before.st_ino,before.st_mtime_ns,before.st_size,before.st_mode) or path.read_bytes()!=expected:
            raise RuntimeError('Concurrent launcher edit; refusing replacement')
        os.replace(temporary,path)
        fd=os.open(path.parent,os.O_RDONLY);os.fsync(fd);os.close(fd)
    finally:
        if temporary.exists():temporary.unlink()
