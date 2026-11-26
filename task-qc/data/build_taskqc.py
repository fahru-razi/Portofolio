"""Membuat demo statis Task Quality Control System: data dummy di SQLite, render template asli, lalu bekukan halaman."""
import os,sys,re,random,shutil,json,itertools,datetime as dt
SRC='/tmp/tq/Task Management - copy'; OUT='/mnt/user-data/outputs/portfolio/task-qc'
os.chdir(SRC); sys.path.insert(0,SRC)
os.environ.update(DATABASE_URL='sqlite:////tmp/tq_demo.db',SECRET_KEY='demo',FLASK_ENV='development')
if os.path.exists('/tmp/tq_demo.db'): os.remove('/tmp/tq_demo.db')
f='routes/task_routes.py'; s=open(f,newline='').read()
if 'per_page = 15' in s: open(f,'w',newline='').write(s.replace('per_page = 15','per_page = 500'))  # semua task dalam satu halaman; filter dilakukan di browser
from app import app
from database import db,UserModel,TaskModel,SupportTicket
from werkzeug.security import generate_password_hash
random.seed(11); now=dt.datetime.utcnow()
NAMES=[('Home Assist','HA','Rumah',['Mengambil gelas dari meja','Membuka pintu lemari','Menyalakan lampu ruang tamu','Memindahkan bantal sofa','Menaruh buku di rak','Menyiram tanaman','Melipat handuk','Menutup tirai jendela','Mengambil remote televisi','Membuang sampah ke tempat sampah','Merapikan sepatu','Mengelap meja']),
 ('Kitchen Skills','KS','Dapur',['Menuang air ke gelas','Memotong sayur','Mengaduk adonan','Menyalakan kompor','Mencuci piring','Menata piring di rak','Membuka kulkas','Mengambil telur','Menutup toples','Mengelap meja dapur','Memasukkan roti ke pemanggang','Menaruh sendok di laci']),
 ('Warehouse Ops','WO','Gudang',['Mengangkat kardus kecil','Memindai label paket','Menumpuk kotak di rak','Membuka pintu gudang','Memindahkan palet ringan','Menata barang berdasarkan ukuran','Menempel label barang','Mengambil barang dari rak atas','Menyusun troli','Menutup kotak dengan lakban','Memeriksa jumlah barang','Menaruh barang retur'])]
plan=['Need Sample']*9+['Sample Done']*8+['Revision']*5+['Ready']*6+['Skipped']*3+['Sent']*5; random.shuffle(plan)
with app.app_context():
    db.create_all(); pw=generate_password_hash('demo'); users={}
    for i,(un,nm,rl) in enumerate([('developer','Rina Pratama','Developer'),('qc_andi','Andi Saputra','Quality Control'),('qc_budi','Budi Santoso','Quality Control'),('spv_dewi','Dewi Anggraini','Supervisor'),('Guest/Publik','Public Guest','Publik')]):
        u=UserModel(username=un,password=pw,email=f'{un.split("/")[0].lower()}@contoh.id',role=rl,nama_lengkap=nm,status='Aktif' if i<4 else 'Offline',last_active=now-dt.timedelta(minutes=5+i*40)); db.session.add(u); users[un]=u
    db.session.flush(); n=0
    for pi,(pn,code,env,names) in enumerate(NAMES):
        for k,name in enumerate(names):
            st=plan[n]; n+=1; sent=st=='Sent'; cat='Ready' if sent else st
            db.session.add(TaskModel(project_name=pn,package_name=f'{code}-Pkg-0{1+k//6}',task_id=f'{code}-{k%6+1:03d}',task_name=name,description=f'Operator merekam video: {name.lower()}.',task_goal=f'Robot dapat melakukan "{name.lower()}" sampai selesai tanpa kesalahan.',initialize_status='Initialized',generalization_direction=random.choice(['Posisi objek','Jenis objek','Pencahayaan']),num=random.randint(10,40),label=random.choice(['A','B','C']),pullable_num=random.randint(0,12),sop='Kamera setinggi dada, durasi 20-40 detik, objek terlihat jelas.',task_type='Manipulasi',environment_type=env,source_template_id=f'TPL-{pi+1}{k+1:02d}',target_num_task=str(random.choice([20,30,50])),env_summary=f'Lingkungan {env.lower()} dengan pencahayaan standar.',excel_status='Synced',case_name=f'Case {k%4+1}',link_sample=None if cat=='Need Sample' else f'https://contoh.id/sample/{code.lower()}-{k+1}',can_buy_item=True,inspector_result=None if cat in('Need Sample','Skipped') else ('Revisi' if cat=='Revision' else 'Lolos'),notes='Posisi kamera perlu diperbaiki.' if cat=='Revision' else None,qc_category=cat,operational_status='Skipped' if cat=='Skipped' else 'Active',sent_by_leader=sent,updated_at=now-dt.timedelta(hours=random.choice([1,2,3,5,8,20,30,50,70,100,140,200])),uploaded_by=random.choice(['qc_andi','qc_budi'])))
    for un,msg,stt in [('qc_andi','Tombol kirim ke tim kadang tidak merespons.','Open'),('spv_dewi','Mohon tambah filter berdasarkan paket.','Closed'),('qc_budi','Unggah Excel gagal untuk file besar.','Open'),('Guest/Publik','Bagaimana cara melihat task yang sudah dikirim?','Open')]:
        db.session.add(SupportTicket(username=un,message=msg,status=stt,created_at=now-dt.timedelta(hours=random.randint(2,90))))
    db.session.commit(); ids={k:(v.id,v.role) for k,v in users.items()}
ROLES={'quality-control':'qc_andi','supervisor':'spv_dewi','developer':'developer'}
PAGES={'tasks':'/tasks','dashboard':'/dashboard','faq':'/faq','profile':'/profile','support':'/support'}; DEV={'admin-support':'/admin/support','admin-users':'/admin/users'}
def client(un):
    c=app.test_client()
    with c.session_transaction() as s: s.update(user_id=ids[un][0],role=ids[un][1],username=un,language='id')
    return c
for d in ('html','css','js'): shutil.rmtree(f'{OUT}/{d}',ignore_errors=True); os.makedirs(f'{OUT}/{d}')
shutil.copy('static/style.css',OUT+'/css/style.css'); shutil.copy('static/script.js',OUT+'/js/script.js')
shutil.copy('/mnt/user-data/outputs/portfolio/helpdesk-it/css/demo.css',OUT+'/css/demo.css'); shutil.copy('/mnt/user-data/outputs/portfolio/helpdesk-it/js/demo.js',OUT+'/js/demo.js')
dev=client('developer'); dash={}
for flt in ['All','Need Sample','Sample Done','Revision','Ready','Skipped','Production']:
    for r in range(0,4):
        for sub in itertools.combinations([p[0] for p in NAMES],r):
            pr=','.join(sorted(sub)) or 'All'; j=dev.get(f'/api/dashboard-data?filter={flt}&project={pr}').get_json(); dash[f'{flt}|{pr}']=j
open(OUT+'/js/demo_data.js','w').write('/* Respons /api/dashboard-data yang sudah dihitung dari data dummy */\nwindow.__DEMO_DASH = '+json.dumps(dash,ensure_ascii=False)+';\n')
shutil.copy(OUT+'/data/demo_shim.js',OUT+'/js/demo_shim.js')
R='../../../'
for role,un in ROLES.items():
    c=client(un); pg={**PAGES,**(DEV if role=='developer' else {})}; routes={v:k for k,v in pg.items()}
    for key,url in pg.items():
        r=c.get(url)
        if r.status_code!=200: print('GAGAL',role,url,r.status_code); continue
        h=r.get_data(as_text=True)
        def link(m):
            a,u=m.group(1),m.group(2); path=re.split(r'[?#]',u)[0]
            if path.startswith('/static/'): return f'{a}="{R}'+{'style.css':'css/style.css','script.js':'js/script.js'}.get(path[8:],'static/'+path[8:])+'"'
            if a=='href' and path in routes: return f'{a}="{R}html/{role}/{routes[path]}/index.html"'
            if a=='href' and path=='/qr_management': return 'href="#" data-demo-remove'
            return 'href="#"' if a=='href' else m.group(0)
        h=re.sub(r'\b(href|src)="(/(?!/)[^"]*)"',link,h)
        h=re.sub(r'<a\b[^>]*data-demo-remove[^>]*>.*?</a>','',h,flags=re.S)
        h=h.replace('<head>',f'<head>\n<script src="{R}js/demo_data.js"></script><script src="{R}js/demo_shim.js"></script>',1)
        p=f'{OUT}/html/{role}/{key}'; os.makedirs(p); open(p+'/index.html','w').write(h)
        print(role.ljust(16),key.ljust(14),len(h)//1024,'KB cards:',h.count('data-category='),'| link absolut:',len(re.findall(r'(?:href|src)="/[^"]*"',h)))
