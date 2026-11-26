"""Membuat demo statis Pecah Sandi: render template asli dengan data dummy (tanpa database) lalu susun folder demo."""
import os,re,sys,json,random,shutil,time
from datetime import datetime
from zoneinfo import ZoneInfo
SRC='/tmp/ps/pecah-sandi-main'; OUT='/mnt/user-data/outputs/portfolio/pecah-sandi'
sys.path.insert(0,SRC)
from flask import Flask,Blueprint,render_template
from services.ciphers import CIPHERS
from services import scoring as sc, pupk as pk
random.seed(5); NOW=time.time(); TZ=ZoneInfo('Asia/Jakarta')
GROUPS=[(1,'Kepramukaan'),(2,'Pengetahuan Umum'),(3,'Sejarah Indonesia')]
RAW=[(1,'Siapa yang dijuluki Bapak Pramuka Indonesia?','Sultan Hamengku Buwono IX',['Sri Sultan Hamengkubuwono IX','HB IX']),(1,'Apa nama lambang Gerakan Pramuka?','Tunas Kelapa',[]),(1,'Kapan Hari Pramuka diperingati?','14 Agustus',[]),(1,'Berapa jumlah Dasa Darma Pramuka?','10',['sepuluh']),(1,'Siapa pendiri gerakan kepanduan dunia?','Robert Baden-Powell',['Baden Powell']),(1,'Simpul apa yang dipakai untuk menyambung dua tali yang sama besar?','Simpul mati',[]),(1,'Apa nama regu pramuka tingkat Siaga?','Barung',[]),
(2,'Apa ibu kota Prancis?','Paris',[]),(2,'Apa planet terbesar di tata surya?','Jupiter',['Yupiter']),(2,'Apa lambang kimia untuk air?','H2O',[]),(2,'Berapa jumlah provinsi di Pulau Jawa?','enam',['6']),(2,'Siapa penemu lampu pijar?','Thomas Alva Edison',['Thomas Edison','Edison']),(2,'Apa nama satuan gaya dalam SI?','Newton',[]),
(3,'Kapan Indonesia memproklamasikan kemerdekaan?','17 Agustus 1945',[]),(3,'Siapa pembaca teks Proklamasi?','Soekarno',['Sukarno','Ir. Soekarno']),(3,'Siapa penjahit bendera pusaka Merah Putih?','Fatmawati',[]),(3,'Apa nama organisasi pergerakan yang didirikan tahun 1908?','Budi Utomo',['Boedi Oetomo']),(3,'Di kota apa Proklamasi dibacakan?','Jakarta',[])]
ITEMS=[{'id':i+1,'group_id':g,'question':q,'answer':a,'alts':al} for i,(g,q,a,al) in enumerate(RAW)]
WORDS=['PRAMUKA','TENDA','KOMPAS','SANDI','SIAGA','PENGGALANG','PENEGAK','PANDEGA','TUNAS KELAPA','API UNGGUN','BENDERA','SEMAPHORE','MORSE','JEJAK','KEMAH','TONGKAT','PETA','SIMPUL','TALI TEMALI','BAKTI','SATYA','DARMA','PERKEMAHAN','PIONIERING','PERTOLONGAN','KETANGKASAN','BARUNG','RAMU','RAKIT','ALAM TERBUKA']
for d in ('html','css','js','fonts','img'): shutil.rmtree(f'{OUT}/{d}',ignore_errors=True)
for d in ('css','js','fonts','img'): shutil.copytree(f'{SRC}/static/{d}',f'{OUT}/{d}')
shutil.copy(OUT+'/data/demo_api.js',OUT+'/js/demo_api.js')
open(OUT+'/js/demo_data.js','w').write('/* Data dummy Pecah Sandi (bank soal, kelompok, PUPK) */\nwindow.__PS = '+json.dumps({'groups':[{'id':i,'name':n} for i,n in GROUPS],'items':ITEMS,'words':WORDS},ensure_ascii=False)+';\n')
# ---- aplikasi Flask minimal hanya untuk merender template (tanpa database)
app=Flask(__name__,template_folder=SRC+'/templates',static_folder=SRC+'/static')
BULAN=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
@app.template_filter('dt')
def fdt(ts,with_time=True):
    if not ts: return '-'
    d=datetime.fromtimestamp(ts,TZ); s=f'{d.day} {BULAN[d.month-1]} {d.year}'; return s+(f', {d:%H.%M}' if with_time else '')
@app.template_filter('dur')
def fdur(sec):
    if sec is None: return '-'
    sec=int(round(sec)); return f'{sec//60}:{sec%60:02d}'
@app.template_filter('num')
def fnum(v,digits=1):
    if v is None: return '-'
    v=round(float(v),digits); return str(int(v)) if v==int(v) else f'{v:.{digits}f}'.replace('.',',')
@app.template_filter('pct')
def fpct(ok,total): return '-' if not total else fnum(100.0*ok/total)+'%'
USER={'id':1,'display_name':'Peserta Demo','username':'peserta','role':'user'}
@app.context_processor
def inject(): return {'csrf_token':lambda:'','csp_nonce':lambda:'','ciphers':CIPHERS,'current_user':USER,'site_origin':'','canonical_url':''}
V=lambda:''
for bpn,rules in {'game':[('index','/'),('play','/play'),('history','/riwayat'),('attempt_detail','/riwayat/<int:attempt_id>')],'pupk':[('hub_pupk','/pupk'),('hub_kombinasi','/kombinasi'),('start','/pupk/mulai'),('run_page','/pupk/run/<int:run_id>'),('reset','/pupk/run/<int:run_id>/reset'),('retry','/pupk/run/<int:run_id>/ulang'),('result','/pupk/hasil/<int:run_id>')],'auth':[('login','/masuk'),('logout','/keluar'),('register_page','/daftar')]}.items():
    bp=Blueprint(bpn,__name__)
    for ep,rule in rules: bp.add_url_rule(rule,ep,V)
    app.register_blueprint(bp)
# ---- data dummy riwayat (memakai fungsi penilaian asli aplikasi)
def attempt(i,days,cipher,mode,scoring,n,tl,err,expired=False):
    texts=[''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ',k=10)) for _ in range(n)] if mode=='random' else random.sample(WORDS if mode=='database' else [pk.sandi_text_for(x['answer']) for x in ITEMS if pk.sandi_text_for(x['answer'])],n)
    st=NOW-days*86400-random.randint(0,40000); qs=[]; ag=dict(letters_correct=0,letters_total=0,words_correct=0,words_total=0,questions_correct=0,questions_total=n)
    for k,t in enumerate(texts):
        ans=''.join((random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (ch!=' ' and random.random()<err) else ch) for ch in t)
        r=sc.score_question(t,ans); lt,wt=sc.counts_for_text(t)
        if expired: qs.append(dict(idx=k,text=t,answer=None,letters_correct=0,letters_total=lt,words_correct=0,words_total=wt,is_correct=0)); ag['letters_total']+=lt; ag['words_total']+=wt; continue
        qs.append(dict(idx=k,text=t,answer=ans,**r)); [ag.__setitem__(a,ag[a]+r[b]) for a,b in (('letters_correct','letters_correct'),('letters_total','letters_total'),('words_correct','words_correct'),('words_total','words_total'),('questions_correct','is_correct'))]
    dur=tl if expired else random.uniform(.3,.9)*tl
    a=dict(id=i,user_id=1,cipher=cipher,mode=mode,scoring=scoring,length=10 if mode=='random' else None,num_questions=n,time_limit=tl,started_at=st,deadline_at=st+tl,finished_at=st+dur,status='expired' if expired else 'finished',timed_out=1 if expired else 0,score=0 if expired else sc.final_score(scoring,ag),duration=dur,group_id=None,**ag)
    return a,qs
SPECS=[(1,12,'kotak','random','huruf',4,300,.35),(2,10,'analog','database','huruf',5,240,.3),(3,8,'jam','database','kata',5,300,.25),(4,6,'kimia','random','huruf',5,240,.2),(5,5,'matematika','pupk','utuh',4,300,.3),(6,3,'kotak','database','utuh',5,180,.12),(7,2,'analog','random','huruf',5,300,.1,True),(8,1,'jam','pupk','huruf',4,300,.08)]
ATT={s[0]:attempt(*s) for s in SPECS}
attempts=sorted([a for a,_ in ATT.values()],key=lambda a:-a['started_at']); done=[a for a in attempts if a['status']=='finished']
lt=sum(a['letters_total'] for a in done); lc=sum(a['letters_correct'] for a in done)
stats=dict(total=len(attempts),finished=len(done),avg=sum(a['score'] for a in done)/len(done),best=max(a['score'] for a in done),letter_acc=100.0*lc/lt,letters_correct=lc,letters_wrong=lt-lc,avg_duration=sum(a['duration'] for a in done)/len(done))
trend=[dict(id=a['id'],t=a['started_at'],score=a['score'],cipher=a['cipher']) for a in reversed(done[:30])]
def sandi_n(g): return len({pk.sandi_text_for(x['answer']) for x in ITEMS if pk.sandi_text_for(x['answer']) and (g is None or x['group_id']==g)})
CFG=dict(default_length=10,min_length=3,max_length=30,default_time=300,min_time=30,max_time=1800,default_questions_random=5,default_questions_db=5,max_questions=20)
def run(kind,status):
    return dict(id=0,kind=kind,group_id=None,title='Semua kelompok',scoring='huruf',shuffled=0,status=status,started_at=NOW,updated_at=NOW,finished_at=NOW if status=='finished' else None,total=1,answered=0,letters_correct=0,letters_total=1,questions_correct=0,score=0)
KL={'pupk':'PUPK','kombinasi':'Kombinasi'}
hubctx=lambda k:dict(kind=k,kind_label=KL[k],groups=[dict(id=i,name=n,n=sum(1 for x in ITEMS if x['group_id']==i)) for i,n in GROUPS],total=len(ITEMS),active=[],recent=[],busy=set())
PAGES={'home':('home.html',dict(pupk_count=len(ITEMS)),'home',''),
 'play':('play.html',dict(config=CFG,word_count=len(WORDS),pupk_count=sandi_n(None),pupk_groups=[dict(id=i,name=n,n=sandi_n(i)) for i,n in GROUPS]),'play',''),
 'history':('history.html',dict(attempts=attempts,stats=stats,trend=trend,runs=[]),'history',''),
 'pupk':('pupk_hub.html',hubctx('pupk'),'hub','pupk'),'kombinasi':('pupk_hub.html',hubctx('kombinasi'),'hub','kombinasi')}
for k in KL:
    PAGES[k+'-run']=('pupk_run.html',dict(run=run(k,'active'),kind_label=KL[k],scoring_label='per huruf',payload=dict(run=run(k,'active'),items=[])),'run',k)
    PAGES[k+'-result']=('pupk_result.html',dict(run=run(k,'finished'),payload=dict(run=run(k,'finished'),items=[]),admin_view=False,kind_label=KL[k],scoring_label='per huruf',verdict='',owner=USER),'result',k)
for i,(a,qs) in ATT.items(): PAGES[f'attempt/{i}']=('attempt.html',dict(payload=dict(attempt=a,questions=qs),owner=USER,admin_view=False),'attempt','')
MAP={'/':'home','/play':'play','/riwayat':'history','/pupk':'pupk','/kombinasi':'kombinasi'}
for name,(tpl,ctx,pg,kind) in PAGES.items():
    with app.test_request_context('/'): h=render_template(tpl,**ctx)
    R='../'*(name.count('/')+2)
    def link(m):
        a,u=m.group(1),m.group(2); path=re.split(r'[?#]',u)[0]
        if path.startswith('/static/'): return f'{a}="{R}{path[8:]}"'
        if a=='href' and path in MAP: return f'{a}="{R}html/{MAP[path]}/index.html"'
        mm=re.fullmatch(r'/riwayat/(\d+)',path)
        if a=='href' and mm: return f'{a}="{R}html/attempt/{mm.group(1)}/index.html"'
        return 'href="#"' if a=='href' else m.group(0)
    h=re.sub(r'\b(href|src)="(/(?!/)[^"]*)"',link,h)
    h=h.replace('url("/static/',f'url("{R}')
    h=re.sub(r'<html\b',f'<html data-demo-page="{pg}" data-demo-kind="{kind}"',h,count=1)
    h=h.replace('</head>',f'<script src="{R}js/demo_data.js" defer></script><script src="{R}js/demo_api.js" defer></script></head>',1)
    p=f'{OUT}/html/{name}'; os.makedirs(p,exist_ok=True); open(p+'/index.html','w').write(h)
    print(name.ljust(18),len(h)//1024,'KB','| link absolut:',len(re.findall(r'(?:href|src)="/[^"]*"',h)))
