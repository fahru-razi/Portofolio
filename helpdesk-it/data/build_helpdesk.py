"""Membuat demo statis Helpdesk IT: render template asli, bundel JS (tanpa server/backend), dan susun folder demo."""
import os,re,shutil,subprocess
from flask import Flask,Blueprint,render_template
SRC='/tmp/hd/backup helpdesk-it'; OUT='/mnt/user-data/outputs/portfolio/helpdesk-it'; ESB='/home/claude/build/node_modules/.bin/esbuild'
app=Flask(__name__,template_folder=SRC+'/templates',static_folder=SRC+'/static')
bp=Blueprint('page',__name__)
for ep,url in [('home','/'),('board_page','/admin/antrean'),('portal_page','/portal'),('kb_page','/bantuan'),('assets_page','/admin/aset'),('analytics_page','/admin/analitik'),('staff_page','/admin/pengguna'),('settings_page','/admin/pengaturan'),('audit_page','/admin/audit'),('login_page','/masuk')]:
    bp.add_url_rule(url,ep,lambda:'')
app.register_blueprint(bp)
brands=re.findall(r'\[data-brand="?([a-z0-9-]+)',open(SRC+'/static/css/theme_base.css').read()); brand=brands[0] if brands else ''
shutil.copytree(SRC+'/static/css',OUT+'/css',dirs_exist_ok=True)
shutil.copytree(SRC+'/static/js',OUT+'/js',dirs_exist_ok=True,ignore=shutil.ignore_patterns('api_client.js'))
shutil.rmtree(OUT+'/html',ignore_errors=True); shutil.rmtree(OUT+'/js/bundle',ignore_errors=True)
ADMIN=['tickets.create','tickets.view_all','tickets.manage','tickets.delete','analytics.view','users.manage','audit.view']
NAV={'admin':{'/admin/antrean':'board','/admin/analitik':'analytics','/admin/pengguna':'staff','/admin/audit':'audit'},'agent':{'/admin/antrean':'board'},'requester':{'/portal':'portal'}}
WHO={'admin':('Maya Anggraini','Administrator',ADMIN),'agent':('Dimas Prakoso','Agen',['tickets.create','tickets.view_all','tickets.manage']),'requester':('Andra Wijaya','Pemohon',['tickets.create'])}
PAGES=[('admin','board','board_page.html','page_board.js'),('admin','analytics','analytics_page.html','page_analytics.js'),('admin','staff','staff_page.html','page_staff.js'),('admin','audit','audit_page.html','page_audit.js'),
       ('agent','board','board_page.html','page_board.js'),('requester','portal','portal_page.html','page_portal.js')]
for s in sorted({p[3] for p in PAGES}):  # satu berkas klasik per halaman: berjalan juga dari file:// tanpa server
    subprocess.run([ESB,f'{OUT}/js/{s}','--bundle','--format=iife','--minify','--log-level=error',f'--outfile={OUT}/js/bundle/{s}'],check=True)
R='../../../'
for role,key,tpl,script in PAGES:
    name,rname,perms=WHO[role]
    with app.test_request_context('/'):
        h=render_template(tpl,app_name='IT Desk',brand=brand,csrf_token=lambda:'',current_user={'full_name':name,'role_name':rname},has_perm=lambda p,perms=perms:p in perms,active_nav=key,page_script=script)
    def nav(m,role=role):
        href=re.search(r'href="([^"]*)"',m.group(0)).group(1)
        return m.group(0).replace(f'href="{href}"',f'href="{R}html/{role}/{NAV[role][href]}/index.html"') if href in NAV[role] else ''
    h=re.sub(r'<a class="nav-link(?:(?!</a>).)*</a>',nav,h,flags=re.S)
    own=f'{R}html/{role}/{key}/index.html'; h=h.replace('href="/"',f'href="{own}"')
    h=re.sub(r'<link rel="modulepreload"[^>]*>','',h)
    h=re.sub(r'<script type="module" src="/static/js/([^"]+)">',lambda m:f'<script defer src="{R}js/bundle/{m.group(1)}">',h)
    h=re.sub(r'(src|href)="/static/',lambda m:f'{m.group(1)}="{R}',h)
    h=h.replace('<html lang="id"',f'<html lang="id" data-demo-role="{role}"',1).replace('</head>','<style>#logoutBtn{display:none}</style></head>',1)
    # data dummy dibaca dari <html data-demo-role>; skrip bundel dimuat setelah dokumen (defer)
    p=f'{OUT}/html/{role}/{key}';os.makedirs(p);open(p+'/index.html','w').write(h)
    print(role,key,len(h),'B | modul:',h.count('type="module"'),'| link absolut:',re.findall(r'(?:src|href)="/[^"]*"',h)[:3],'| menu:',len(re.findall('class="nav-link',h)))
