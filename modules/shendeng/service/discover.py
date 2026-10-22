"""Public indexes are discovery only. Keep links and original metadata; never import their editorial text."""
import concurrent.futures, datetime, json, urllib.request, xml.etree.ElementTree as ET
from common import ROOT, DATA, read_json, write_json, runtime

def discover():
    cfg=read_json(ROOT/'site/discovery.json')
    proxy=runtime().get('proxyUrl')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':proxy,'https':proxy} if proxy else {}))
    prior=read_json(DATA/'discovery.json',{'sources':[]})
    old={s['id']:s for s in prior['sources']}
    sources=json.loads((ROOT/'industry/sources.json').read_text())['sources']
    jobs=[dict(id=s['id'],name=s['name'],url=s['config']['feedUrl'],kind='rss') for s in sources if s.get('kind')=='rss' and s.get('enabled') is not False]
    jobs+=cfg['indexes']
    def fetch(source):
        try:
            with opener.open(urllib.request.Request(source['url'],headers={'User-Agent':'ShendengNews/1.0 (+https://shendeng.news/)'}),timeout=25) as r:data=r.read()
            if source['kind']=='public-index':
                items=[{'url':i['links']['original'],'publishedAt':i.get('publishedAt'),'source':i.get('source',{}).get('name')} for i in json.loads(data).get('items',[])[:30]]
            else:
                root=ET.fromstring(data);items=[]
                for entry in root.findall('.//item')[:12]:
                    items.append({'url':entry.findtext('link'),'title':entry.findtext('title'),'publishedAt':entry.findtext('pubDate')})
                if not items:
                    ns={'a':'http://www.w3.org/2005/Atom'}
                    for entry in root.findall('a:entry',ns)[:12]:
                        links=entry.findall('a:link',ns);link=next((l.get('href') for l in links if l.get('rel','alternate')=='alternate'),None)
                        items.append({'url':link,'title':entry.findtext('a:title',namespaces=ns),'publishedAt':entry.findtext('a:published',namespaces=ns) or entry.findtext('a:updated',namespaces=ns)})
            return {'id':source['id'],'url':source['url'],'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'items':[i for i in items if i.get('url')]}
        except Exception as error:
            return {**old.get(source['id'],{'id':source['id'],'url':source['url'],'items':[]}), 'error':str(error)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(fetch,jobs))
    write_json(DATA/'discovery.json',{'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'purpose':'discovery-only-open-originals-before-selection','sources':results})
    return sum(len(s['items']) for s in results),sum('error' in s for s in results)

if __name__=='__main__':print(discover())
