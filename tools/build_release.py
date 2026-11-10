"""Build a sanitized source archive and matching local deployment candidates."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, zipfile

ROOT=Path(__file__).resolve().parents[1]
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def excluded(path):
    return any(p in {'build','__pycache__','.venv','.git','.DS_Store','project.private.config.json'} for p in path.parts) or path.suffix=='.pyc' or path.name in {'source-release.zip','MANIFEST.json','.env'}
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-url',default='',help='Verified public HTTPS repository or source archive URL')
    parser.add_argument('--release',action='store_true',help='Require a configured public source offer')
    args=parser.parse_args()
    if args.source_url and not re.fullmatch(r'https://[a-zA-Z0-9][a-zA-Z0-9.-]*(?::443)?(?:[/#?][^\s]*)?',args.source_url):
        raise SystemExit('Invalid public HTTPS source URL')
    if args.release and not args.source_url:
        raise SystemExit('Public source URL required. Publish only after owner approval.')
    out=ROOT/'build';stage=out/'source';stage.mkdir(parents=True,exist_ok=True)
    # Clear only our generated tree; never touch original working projects.
    for item in stage.iterdir():
        if item.is_dir():shutil.rmtree(item)
        else:item.unlink()
    for path in sorted(ROOT.rglob('*')):
        rel=path.relative_to(ROOT)
        if path.is_file() and not excluded(rel):
            target=stage/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    config=stage/'client/miniprogram/config.js'
    config.write_text(config.read_text().replace("sourceCodeUrl: ''",'sourceCodeUrl: '+json.dumps(args.source_url)))
    records=[{'path':str(p.relative_to(stage)),'size':p.stat().st_size,'sha256':digest(p)} for p in sorted(stage.rglob('*')) if p.is_file()]
    (stage/'MANIFEST.json').write_text(json.dumps({'schema':1,'date':'2026-11-10','license':'AGPL-3.0',
          'publicSourceUrl':args.source_url,'ownerApprovedPublicRelease':json.loads((ROOT/'docs/release-decision.json').read_text()).get('ownerApprovedPublicRelease',False) if (ROOT/'docs/release-decision.json').exists() else False,'publicationStatus':'not_checked_by_local_builder','files':records},ensure_ascii=False,indent=2)+'\n')
    def archive(folder,output):
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for p in sorted(folder.rglob('*')):
                if p.is_file():z.write(p,str(p.relative_to(folder)))
    source_zip=out/'mahjong-source-candidate.zip';archive(stage,source_zip)
    server=out/'server-deploy'
    if server.exists():shutil.rmtree(server)
    shutil.copytree(stage/'server',server)
    shutil.copy2(source_zip,server/'source-release.zip')
    server_zip=out/'mahjong-server-candidate.zip';archive(server,server_zip)
    client_zip=out/'mahjong-client-template.zip';archive(stage/'client',client_zip)
    report={'candidateOnly':True,'sourceOfferConfigured':bool(args.source_url),'publicSourceUrl':args.source_url,'fileCount':len(records),
            'archives':[{'name':p.name,'size':p.stat().st_size,'sha256':digest(p)} for p in [source_zip,server_zip,client_zip]],
            'unresolved':['Dataset image license not independently verified','Verify public repository content against this build manifest','Remote deployment and WeChat review not performed']}
    (out/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
