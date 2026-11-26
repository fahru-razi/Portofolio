import os,re,random,shutil,sys,datetime as dt
from werkzeug.security import generate_password_hash
sys.path.insert(0,'.')
from app import create_app
from app.config import TestConfig
class Cfg(TestConfig): SESSION_PROTECTION=None
app=create_app(Cfg)
from app.models import *
from app.models import DEFAULT_SHIFT_TYPES
random.seed(7)
OUT='/mnt/user-data/outputs/portfolio/cc-indonesia'
shutil.rmtree(OUT+'/html',ignore_errors=True); os.makedirs(OUT,exist_ok=True)
shutil.copytree('app/static',OUT,dirs_exist_ok=True,ignore=shutil.ignore_patterns('sw.js'))
import zoneinfo
NOW=dt.datetime.now(zoneinfo.ZoneInfo('Asia/Jakarta')).replace(tzinfo=None); today=NOW.date(); D=dt.timedelta
def at(d,hm): return dt.datetime.combine(d,dt.time(*hm))
with app.app_context():
    db.create_all()
    deps={n:Department(name=n,color=c) for n,c in [('Produksi','#4f6ef7'),('Supervisor','#22c55e'),('Quality Control','#ef4444'),('Inventaris','#f59e0b'),('IT','#06b6d4'),('Manajemen','#8b5cf6'),('Staff','#64748b')]}
    pusat=Office(name='Kantor Pusat',address='Jl. Contoh No. 1, Jakarta',latitude=-6.2088,longitude=106.8456)
    cab=Office(name='Kantor Cabang',address='Jl. Contoh No. 2, Tangerang',latitude=-6.1783,longitude=106.6319)
    db.session.add_all([*deps.values(),pusat,cab]); db.session.flush()
    # nama, tipe, mulai, selesai, toleransi, batas check-in (menit setelah mulai), departemen, jumlah orang, kantor
    SP=[('Shift 3 - Produksi','shift_3',(0,0),(8,0),1,60,'Produksi',11,pusat),
        ('Manajemen / Kantor','management',(7,30),(16,30),1,210,'Manajemen',5,pusat),
        ('Staff','shift_1',(7,30),(16,30),1,60,'Staff',3,pusat),
        ('Shift 1 - Supervisor','shift_1',(7,45),(16,15),1,60,'Supervisor',1,pusat),
        ('Shift 1 - Produksi','shift_1',(8,0),(16,0),5,60,'Produksi',6,pusat),
        ('Shift 2 - Supervisor','shift_2',(15,45),(0,15),1,90,'Supervisor',2,pusat),
        ('Shift 2 - Produksi','shift_2',(16,0),(0,0),1,120,'Produksi',23,pusat),
        ('Shift 3 - Produksi Eksternal','shift_3',(23,30),(7,30),1,90,'Produksi',9,cab),
        ('Shift 3 - Supervisor Eksternal','shift_3',(23,30),(7,30),1,75,'Supervisor',1,cab),
        ('Shift 3 - Supervisor Internal','shift_3',(23,45),(8,15),1,60,'Supervisor',1,pusat),
        ('Shift 1 - Inventaris','shift_1',(7,30),(16,30),1,60,'Inventaris',0,pusat),
        ('Shift 1 - IT','shift_1',(7,30),(16,30),1,60,'IT',0,pusat),
        ('Shift 1 - Quality Control','shift_1',(7,30),(16,30),1,210,'Quality Control',0,pusat),
        ('Lembur','shift_1',(8,0),(16,0),0,120,'Produksi',0,pusat),
        ('Shift 2 - Inventaris','shift_2',(15,30),(0,30),1,60,'Inventaris',0,pusat),
        ('Shift 2 - IT','shift_2',(15,30),(0,30),1,60,'IT',0,pusat),
        ('Shift 2 - Quality Control','shift_2',(15,30),(0,30),1,60,'Quality Control',0,pusat),
        ('Shift 3 - Inventaris','shift_3',(23,30),(8,30),1,90,'Inventaris',0,pusat),
        ('Shift 3 - Quality Control','shift_3',(23,30),(8,30),1,90,'Quality Control',0,pusat)]
    shifts={}
    for n,t,a,b,tol,cm,dp,hc,o in SP:
        cr=(b[0],b[1])<=(a[0],a[1]); off=1 if a[0]>=22 else 0
        cut=(at(today,a)+D(minutes=cm)).time()
        shifts[n]=Shift(office_id=o.id,name=n,shift_type=('management' if t=='management' else re.sub(r'[^a-z0-9]+','_',n.lower()).strip('_')),work_start=dt.time(*a),work_end=dt.time(*b),cutoff_time=cut,late_tolerance_minutes=tol,crosses_midnight=cr,attendance_date_offset=off)
    db.session.add_all(shifts.values()); db.session.flush()
    pw=generate_password_hash('demo')
    F=['Andi','Budi','Citra','Dewi','Eko','Fitri','Gilang','Hana','Imam','Joko','Kirana','Lukman','Maya','Nanda','Oki','Putri','Rangga','Sari','Tegar','Wulan']
    L=['Saputra','Santoso','Lestari','Anggraini','Prasetyo','Handayani','Ramadhan','Hidayat','Susilo','Wijaya','Pratama','Kusuma','Nugroho','Permata','Firmansyah','Setiawan']
    nm=iter(random.sample([f'{a} {b}' for a in F for b in L],62))
    mgr=User(full_name='Rina Pratama',email='manager@demo.example',password_hash=pw,role='manager',employee_code='CC-0000',department='Manajemen',department_id=deps['Manajemen'].id)
    db.session.add(mgr); db.session.flush()
    OV={'Manajemen / Kantor':{4:'leave'},'Staff':{2:'late'},'Shift 1 - Produksi':{5:'absent'},'Shift 3 - Produksi Eksternal':{8:'sick'}}
    NOT_STARTED={'Shift 2 - Supervisor','Shift 2 - Produksi'}
    people=[]; n=0
    for sn,t,a,b,tol,cm,dp,hc,o in SP:
        for k in range(hc):
            n+=1; u=User(full_name=next(nm),email=f'karyawan{n}@demo.example',password_hash=pw,role='employee',employee_code=f'CC-{n:04d}',department=dp,department_id=deps[dp].id)
            db.session.add(u); people.append((u,shifts[sn],o,OV.get(sn,{}).get(k,'pending' if sn in NOT_STARTED else 'present')))
    db.session.flush()
    def log(u,sh,o,sd,stt,lr=None):
        a=sh.work_start; off=sh.attendance_date_offset
        st=dt.datetime.combine(sd-D(days=off),a); en=dt.datetime.combine(sd-D(days=off),sh.work_end)+(D(days=1) if sh.crosses_midnight else D())
        ci=co=None; late=0
        if stt=='present': ci=st-D(minutes=random.randint(5,40))
        elif stt=='late': late=sh.late_tolerance_minutes+random.randint(5,30); ci=st+D(minutes=late)
        if ci and (sd<today or en<NOW): co=en+D(minutes=random.randint(0,20))
        db.session.add(AttendanceLog(user_id=u.id,office_id=o.id,shift_id=sh.id,department_id=u.department_id,work_date=sd,shift_date=sd,check_in_at=ci,check_out_at=co,check_in_lat=o.latitude,check_in_lng=o.longitude,distance_meters=random.randint(3,80) if ci else None,gps_accuracy_meters=random.randint(5,30) if ci else None,status=stt,late_minutes=late,working_minutes=int((co-ci).total_seconds()//60) if ci and co else None,leave_request_id=lr))
    def leave(u,sd,typ):
        lr=LeaveRequest(user_id=u.id,leave_type=typ,start_date=sd,end_date=sd,total_days=1,reason='Keperluan pribadi' if typ=='day_off' else 'Sakit, istirahat',status='approved',reviewed_by=mgr.id,reviewed_at=at(sd-D(days=1),(10,0)))
        db.session.add(lr); db.session.flush(); return lr.id
    for u,sh,o,ts in people:
        db.session.add(UserOffice(user_id=u.id,office_id=o.id,is_primary=True))
        db.session.add(WorkSchedule(user_id=u.id,office_id=o.id,shift_id=sh.id,work_days=[0,1,2,3,4],day_off_day=[5,6],effective_from=today-D(days=90)))
        for d in range(0,45):
            sd=today-D(days=d)
            if sd.weekday()>4: continue
            if d==0:
                if ts=='pending': continue
                s2={'leave':'day_off'}.get(ts,ts); lr=leave(u,sd,'day_off' if ts=='leave' else 'sick') if ts in('leave','sick') else None
                log(u,sh,o,sd,s2,lr)
            else:
                r=random.random()
                if r<.03: log(u,sh,o,sd,'sick',leave(u,sd,'sick'))
                elif r<.05: log(u,sh,o,sd,'day_off',leave(u,sd,'day_off'))
                else: log(u,sh,o,sd,'present' if r<.92 else 'late')
    pend=[p for p in people if p[3]=='present'][2::5][:6]
    wd=[today+D(days=k) for k in range(1,15) if (today+D(days=k)).weekday()<5]
    for i,(u,sh,o,ts) in enumerate(pend):
        a=wd[i%5]; db.session.add(LeaveRequest(user_id=u.id,leave_type='sick' if i%3==2 else 'day_off',start_date=a,end_date=a,total_days=1,reason='Keperluan keluarga' if i%3 else 'Kontrol kesehatan',status='pending'))
    db.session.commit()
    demo_emp=next(u for u,sh,o,ts in people if sh.name=='Shift 1 - Produksi' and ts=='present')
    ids={'employee':demo_emp.get_id(),'manager':mgr.get_id()}
sk=re.compile(r'^/(employee|manager)(/[a-z0-9_-]+)*$')
bad=re.compile(r'logout|download|export|/add$|toggle|delete|\.json$')
def rel(path): return '../'*(path.strip('/').count('/')+2)
pages={}
def shim(root): return f'<script>(()=>{{const R="{root}",f=window.fetch;window.fetch=(u,o={{}})=>{{u=String(u);if((o.method||"GET").toUpperCase()!=="GET")return Promise.resolve(new Response(JSON.stringify({{ok:true,demo:true}}),{{headers:{{"Content-Type":"application/json"}}}}));if(u[0]==="/")u=u.indexOf("/static/")===0?R+u.slice(8):R+"html"+u;return f(u,o)}};document.addEventListener("submit",e=>{{e.preventDefault();alert("Mode demo: aksi disimulasikan dan tidak disimpan.")}},true)}})()</script>'
for role,uid in ids.items():
    c=app.test_client()
    with c.session_transaction() as s: s['_user_id']=uid; s['_fresh']=True
    q=[f'/{role}/dashboard']; seen=set()
    while q:
        p=q.pop(0)
        if p in seen: continue
        seen.add(p); r=c.get(p)
        if r.status_code!=200 or 'text/html' not in r.content_type: continue
        h=r.get_data(as_text=True); pages[p]=h
        for m in re.findall(r'href="(/[^"#?]*)',h):
            if sk.match(m) and m.startswith(f'/{role}') and not bad.search(m) and m not in seen: q.append(m)
    for j in ([f'/employee/history/data?year={today.year}'] if role=='employee' else []):
        r=c.get(j)
        if r.status_code==200: pages[j.split('?')[0]+'#json']=r.get_data(as_text=True)
print(sorted(pages))
for p,h in pages.items():
    if p.endswith('#json'):
        fp=OUT+'/html'+p[:-5]; os.makedirs(os.path.dirname(fp),exist_ok=True); open(fp,'w').write(h); continue
    R=rel(p)
    def fix(m):
        a,u=m.group(1),m.group(2); path=re.split(r'[?#]',u)[0]
        if u.startswith('/static/'): return f'{a}="{R}{u[8:]}"'
        if path in pages and a=='href': return f'{a}="{R}html{path}/index.html"'
        return f'{a}="{R}html{u}"'
    h=re.sub(r'\b(href|src|action)="(/(?!/)[^"]*)"',fix,h)
    h=h.replace('<html','<html data-root="%s"'%R,1).replace('</head>',shim(R)+'</head>',1)
    fp=OUT+'/html'+p+'/index.html'; os.makedirs(os.path.dirname(fp),exist_ok=True); open(fp,'w').write(h)
