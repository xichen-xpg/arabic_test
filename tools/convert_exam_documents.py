"""Convert legacy Word sources into a disposable DOCX cache using LibreOffice."""
import argparse
import shutil
import subprocess
from pathlib import Path
from inspect_exam_documents import CACHE, inventory, inspect

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--soffice', required=True)
    args = parser.parse_args()
    records = inventory()
    legacy = CACHE / 'legacy'
    legacy.mkdir(exist_ok=True)
    (CACHE / 'docx').mkdir(exist_ok=True)
    for record in records:
        target = Path(record['docx'])
        if target.exists():
            continue
        source = legacy / (record['sha256'] + '.doc')
        shutil.copyfile(record['source'], source)
        subprocess.run([args.soffice, '-env:UserInstallation=' + (CACHE / 'lo-profile').as_uri(),
                        '--headless', '--convert-to', 'docx:Office Open XML Text',
                        '--outdir', str(target.parent), str(source)], check=True, timeout=90)
        if not target.exists():
            raise RuntimeError('Conversion failed: ' + record['source'])
        print('Converted ' + Path(record['source']).name, flush=True)
    inspect(records)
