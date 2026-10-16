import {firebaseConfig} from '../app-config.js';
import {DEFAULT_SETTINGS,STATUS,esc,schoolClock,normalizeRfid,validateStudent,validateSchedule,reportRows,summary,dateRange,scheduleFor,isSchoolDay,enrolled,minutes} from './core.js';
import {createDemoStore,createFirebaseStore} from './store.js';

const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
const paths={
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 scan:'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M8 9h8v6H8z M1 12h22',
 chart:'M4 3v18h18 M9 17v-5 M14 17V8 M19 17V5',
 settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M9 2h6l.5 3 2 1.2 2.8-1 3 5.2L21 12l-.1 2.4 2.1 1.8-3 5.2-2.8-1-2.2 1.2-.5 2.4H9l-.5-3-2-1.2-2.8 1-3-5.2L3 12l.1-2.4L1 7.8l3-5.2 2.8 1L9 2',
 clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 check:'M5 12l4 4L19 6', cross:'M6 6l12 12 M6 18L18 6',
 calendar:'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2',
 mail:'M3 5h18v14H3z M3 5l9 8 9-8',
 class:'M3 21V5l9-3 9 3v16 M8 21v-5h8v5 M7 7h2 M15 7h2 M7 11h2 M15 11h2',
 arrow:'M5 12h14 M14 7l5 5-5 5', down:'M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6',
 upload:'M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5',plus:'M12 5v14 M5 12h14',
 search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 edit:'M16 3l5 5-12 12H4v-5L16 3 M13 6l5 5',
 logout:'M9 4H4v16h5 M10 12h11 M16 7l5 5-5 5',
 book:'M12 5v16 M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1',
 shield:'M12 2l8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3 M8 12l3 3 5-6',
 volume:'M11 4L6 8H2v8h4l5 4V4 M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
 expand:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
 menu:'M4 6h16 M4 12h16 M4 18h16',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12',
 card:'M2 5h20v14H2z M6 9h3v4H6z M13 9h5 M13 13h5',
 bell:'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10 M10 21h4',
 info:'M12 10v7 M12 6v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
};
const icon=(name,size=18)=>`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.info}"/></svg>`;
let store,s,authUnsubscribe,unsubscribeData,view='dashboard',lastDate='',sound=false,toastTimer,dirtySettings=false,pendingLogo=null;
let studentSearch='',studentClass='',studentPage=1,scanMode='auto',scanQueue=[],scanRunning=false,lastScanResult=null;
let report={from:'',to:'',className:'',status:'',records:[],loaded:false,page:1,request:0};
let importRows=[];
const pageTitles={dashboard:'Dashboard',students:'Data Siswa',scanner:'Absensi RFID',reports:'Rekap Absensi',settings:'Pengaturan',help:'Panduan Penggunaan'};
const current=()=>schoolClock(new Date(),s?.settings.timezone||'Asia/Jakarta');
const today=()=>current().date;
const initials=name=>String(name||'?').split(' ').slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const humanDate=date=>new Intl.DateTimeFormat('id-ID',{dateStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date(date+'T12:00:00Z'));
const dayLabel=date=>new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(date+'T12:00:00Z'));
const timeOf=iso=>iso?new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:s?.settings.timezone||'Asia/Jakarta',hourCycle:'h23'}).format(new Date(iso)).replace('.',':'):'—';
const badge=status=>`<span class="badge ${STATUS[status]||'neutral'}">${status==='Hadir'?icon('check',11):''}${esc(status)}</span>`;
const empty=(text,symbol='users')=>`<div class="empty">${icon(symbol,30)}${text}</div>`;
const activeStudents=()=>s.students.filter(st=>enrolled(st,today()));
const logo=()=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s?.settings.logo||'')?s.settings.logo:'./assets/icon.svg';
const classOptions=(selected='',all=true)=>(all?'<option value="">Semua kelas</option>':'<option value="">Pilih kelas</option>')+s.settings.classes.map(c=>`<option ${c===selected?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('');
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=error?'error':'';el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',6500)}
function readableError(error){
 const code=error?.code||'';
 if(/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code))return 'Email atau password admin salah.';
 if(/too-many-requests/.test(code))return 'Terlalu banyak percobaan masuk. Coba lagi nanti.';
 if(/permission-denied/.test(code))return 'Akses ditolak. Periksa Firestore Rules dan dokumen admins/{UID} (active: true).';
 if(/unavailable|network-request-failed|deadline-exceeded/.test(code))return 'Koneksi ke Firebase gagal. Periksa internet; data belum dikonfirmasi tersimpan.';
 if(/quota|resource-exhausted/.test(code))return 'Kuota Firebase habis. Periksa tab Usage di Firebase; tunggu kuota pulih.';
 return error?.message||'Terjadi kesalahan. Coba lagi.';
}
function applyBrand(){
 document.documentElement.style.setProperty('--accent',s.settings.color);
 const hex=s.settings.color.slice(1), channels=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const lum=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
 document.documentElement.style.setProperty('--on-accent',lum>.4?'#173c36':'#ffffff');
 document.title=`Hadir · ${s.settings.schoolName}`;
 $$('.school-name').forEach(el=>el.textContent=s.settings.schoolName);
 $$('.school-subtitle').forEach(el=>el.textContent=s.settings.schoolSubtitle);
 $$('.school-logo').forEach(el=>el.src=logo());
}
function shell(){
 $('#app').innerHTML=`<div class="overlay" id="navOverlay"></div><aside class="sidebar" id="sidebar">
 <div class="brand"><img src="./assets/icon.svg" width="39" height="39" alt=""><div><strong>Hadir<span>.</span></strong><small>SCHOOL ATTENDANCE</small></div></div>
 <div class="nav-label">RUANG ADMINISTRASI</div><nav aria-label="Menu utama">${[['dashboard','grid','Dashboard'],['students','users','Data Siswa'],['scanner','scan','Absensi RFID'],['reports','chart','Rekap Absensi'],['settings','settings','Pengaturan']].map(([id,i,title])=>`<button class="nav-item" data-view="${id}">${icon(i)}${title}${id==='scanner'?'<span class="nav-badge">USB</span>':''}</button>`).join('')}</nav>
 <div class="sidebar-bottom"><button class="nav-item" data-view="help">${icon('book')}Panduan Penggunaan</button><div class="school-mini"><img class="school-logo" src="./assets/icon.svg" alt="Logo sekolah"><div><b class="school-name"></b><span class="school-subtitle">Terhubung dalam kehadiran.</span></div></div><button class="nav-item" id="logout">${icon('logout')}${store.demo?'Keluar dari demo':'Keluar aplikasi'}</button><div class="app-version"><span>Hadir v1.0</span><span>RFID • USB</span></div></div></aside>
 <main class="main"><header class="topbar"><div class="button-row"><button class="icon-button mobile-menu" id="mobileMenu" aria-label="Buka menu">${icon('menu')}</button><div class="breadcrumb"><span>Ruang Sekolah</span><span class="crumb-arrow">/</span><b id="crumb">Dashboard</b></div></div><div class="top-actions"><div class="connection" id="connection"><i class="dot"></i><span>Menghubungkan…</span></div><div class="divider"></div><button class="icon-button" id="emailQueue" title="Antrean email hari ini" aria-label="Antrean email">${icon('bell')}</button><div class="profile"><span class="avatar">AD</span><div><b>Administrator</b><span>${store.demo?'Ruang demonstrasi':'Admin Sekolah'}</span></div></div></div></header><div class="content"><div id="demoBanner"></div><div id="view"></div><footer class="footer"><span>© ${new Date().getFullYear()} <span class="school-name"></span> • Hadir</span><span>Setiap kehadiran punya arti.</span></footer></div></main><button class="btn kiosk-exit" id="exitKiosk">${icon('expand')}Keluar layar penuh</button>`;
 $$('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
 $('#mobileMenu').onclick=()=>{$('#sidebar').classList.add('open');$('#navOverlay').classList.add('visible')};
 $('#navOverlay').onclick=()=>{$('#sidebar').classList.remove('open');$('#navOverlay').classList.remove('visible')};
 $('#logout').onclick=async()=>{if(scanRunning){toast('Tunggu antrean pemindaian selesai.',true);return}unsubscribeData?.();if(store.demo){store.stop();location.href=location.pathname}else{await store.logout()}};
 $('#emailQueue').onclick=showEmailQueue;
 $('#exitKiosk').onclick=()=>{document.body.classList.remove('full-kiosk');if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{})};
 if(store.demo){$('#demoBanner').innerHTML='<div class="demo-banner"><span><b>MODE DEMO</b> — Seluruh nama dan data di sini adalah contoh. Data demo tersimpan hanya di browser ini.</span><button id="resetDemo">Reset demo</button></div>';$('#resetDemo').onclick=()=>{if(confirm('Hapus perubahan data demo dan mulai ulang?')){store.reset();location.href=location.pathname+'?demo=1'}}}
}
function pageHead(title,description,action=''){
 return `<div class="page-head"><div><h1>${title}</h1><p>${description}</p></div>${action||`<span class="date-chip">${icon('calendar',15)}${humanDate(today())}</span>`}</div>`;
}
function navigate(next){
 if(scanRunning&&next!=='scanner'){toast('Tunggu antrean pemindaian selesai.',true);return}
 if(view==='settings'&&dirtySettings&&!confirm('Perubahan belum disimpan. Tinggalkan halaman?'))return;
 dirtySettings=false;pendingLogo=null;view=next;
 $('#sidebar')?.classList.remove('open');$('#navOverlay')?.classList.remove('visible');
 document.body.classList.remove('full-kiosk');draw();window.scrollTo({top:0,behavior:'auto'});
}
function draw(){
 $$('.nav-item[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#crumb').textContent=pageTitles[view];
 if(!s.ready){$('#view').innerHTML=empty(s.error?esc(s.error):'Mengambil data sekolah…','refresh');return}
 ({dashboard:drawDashboard,students:drawStudents,scanner:drawScanner,reports:drawReports,settings:drawSettings,help:drawHelp}[view]||drawDashboard)();
}
function onData(data){
 const wasReady=s?.ready;s=data;applyBrand();updateConnection();
 if(!wasReady){draw();return}
 if(!s.ready)return;
 if(view==='dashboard')drawDashboard();
 if(view==='students')renderStudentsTable();
 if(view==='scanner')renderScannerSide();
 if(view==='reports'){
  if(report.loaded&&report.from===today()&&report.to===today()){report.records=s.records}
  renderReportTable();
 }
 if(s.error)toast('Sinkronisasi gagal: '+s.error,true);
}
function updateConnection(){
 const el=$('#connection');if(!el||!s)return;
 el.innerHTML=`<i class="dot ${!s.online||(!navigator.onLine&&!store.demo)?'off':''}"></i><span>${store.demo?'Mode demo':!navigator.onLine?'Internet terputus':s.online?'Firebase terhubung':'Menyambungkan Firebase'}</span>`;
}
function dailyRows(){return reportRows(s.students,s.records,s.settings,today(),today())}
function statCard(title,value,symbol,color,note){return `<div class="stat"><span class="stat-icon ${color}">${icon(symbol,17)}</span><div class="stat-label">${title}</div><div class="stat-number">${value}</div><div class="stat-note">${note}</div></div>`}
function drawDashboard(){
 const rows=dailyRows(), stats=summary(rows), classes=[...new Set([...s.settings.classes,...rows.map(r=>r.className)])];
 const greeting=current().minutes<660?'pagi':current().minutes<900?'siang':current().minutes<1080?'sore':'malam';
 $('#view').innerHTML=pageHead(`Selamat ${greeting}, Admin <span style="font-size:24px">☀</span>`,'Pantau kehadiran siswa dan awali hari dengan lebih teratur.')+
 `<section class="hero"><div><div class="eyebrow"><i class="dot"></i> SETIAP HARI, LEBIH TERHUBUNG</div><h2>Kehadiran terpantau.<br>Belajar lebih tenang.</h2><p>Satu sentuhan kartu, satu langkah menuju disiplin.</p><button class="btn primary compact" id="goScan">Mulai absensi ${icon('arrow',14)}</button></div><div class="hero-art" aria-hidden="true"><div class="id-card"><div class="card-head">${icon('shield',14)}KARTU PELAJAR</div><div class="card-photo">${icon('users',24)}</div><div class="card-lines"></div><div class="card-lines short"></div><div class="card-check">${icon('check',20)}</div></div></div></section>
 <div class="stats-grid">${statCard('Jumlah Siswa',rows.length,'users','','Siswa aktif hari ini')}${statCard('Siswa Hadir',stats.present,'check','green','<em>'+stats.rate+'%</em> dari siswa aktif')}${statCard('Siswa Terlambat',stats.late,'clock','orange','Bagian dari siswa hadir')}${statCard('Tidak Masuk / Alpa',stats.absent,'cross','red','Dihitung setelah jam masuk')}${statCard('Siswa Izin',stats.permit,'mail','blue',stats.sick+' siswa sakit terpisah')}${statCard('Jumlah Kelas',s.settings.classes.length,'class','purple','Kelas yang terdaftar')}</div>
 <div class="grid-two"><section class="panel"><div class="panel-head"><div><h2>Kehadiran setiap kelas</h2><p>Persentase kehadiran siswa hari ini</p></div><span class="badge success">${isSchoolDay(s.settings,today())?'Hari sekolah':'Hari libur'}</span></div>${classes.map((c,i)=>{const rr=rows.filter(r=>r.className===c),st=summary(rr);return `<div class="class-row"><span class="class-icon">${esc(c.split(' ')[0])}</span><div><div class="class-info"><b>Kelas ${esc(c)}</b><span>${st.present} dari ${rr.length} siswa</span></div><div class="progress"><span style="width:${st.rate}%"></span></div></div><b class="percent">${st.rate}<span class="muted small">%</span></b></div>`}).join('')}<div class="panel-foot">${stats.waiting} siswa belum absen • ${stats.sick} sakit. Hadir mencakup tepat waktu dan terlambat.</div></section>
 <section class="panel"><div class="panel-head"><div><h2>Aktivitas terbaru</h2><p>Catatan masuk dan pulang hari ini</p></div><span class="badge neutral">${icon('refresh',10)}Live</span></div>${activityHTML(5)}<div class="panel-foot"><button class="btn light compact" id="goReport">Lihat rekap lengkap ${icon('arrow',13)}</button></div></section></div>
 <div class="quick-strip">${icon('shield',27)}<div><h3>Ruang kehadiran yang tertata.</h3><p>Kelola data siswa, kartu RFID, dan laporan dalam satu tempat.</p></div><button class="btn compact" id="goStudents">Kelola siswa ${icon('arrow',13)}</button></div>`;
 $('#goScan').onclick=()=>navigate('scanner');$('#goReport').onclick=()=>navigate('reports');$('#goStudents').onclick=()=>navigate('students');
}
function activityHTML(limit=5){
 const activity=s.records.flatMap(r=>[...(r.checkInAt?[{...r,kind:'Masuk',at:r.checkInAt}]:[]),...(r.checkOutAt?[{...r,kind:'Pulang',at:r.checkOutAt}]:[])]).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,limit);
 return activity.length?activity.map(r=>`<div class="activity-row"><span class="avatar">${esc(initials(r.name))}</span><div class="activity-info"><b>${esc(r.name)}</b><small>${esc(r.className)} · Absen ${r.kind.toLowerCase()}</small></div><div class="activity-time"><b>${timeOf(r.at)}</b>${r.kind==='Pulang'?badge('Hadir'):badge(r.status)}</div></div>`).join(''):empty('Belum ada aktivitas absensi hari ini.','scan');
}
function drawStudents(){
 $('#view').innerHTML=pageHead('Data Siswa','Semua data siswa dan kartu, tersimpan dengan rapi.',`<button class="btn primary" id="addStudent">${icon('plus',16)}Tambah siswa</button>`)+
 `<section class="panel"><div class="toolbar"><div class="search">${icon('search',16)}<input id="studentSearch" value="${esc(studentSearch)}" placeholder="Cari nama, kelas, atau ID RFID…" aria-label="Cari siswa"></div><select class="control filter-select" id="studentClass" aria-label="Filter kelas">${classOptions(studentClass)}</select><button class="btn" id="studentExport">${icon('down',15)}Unduh data</button><button class="btn light" id="importStudents">${icon('upload',15)}Impor Excel</button></div><div id="studentTable"></div></section><div class="notice">${icon('info',14)} ID RFID harus sama persis dengan keluaran pembaca USB, termasuk angka nol di depan. Email orang tua boleh dikosongkan. Siswa yang diarsipkan tetap tersedia dalam rekap riwayat.</div>`;
 $('#addStudent').onclick=()=>openStudent();$('#studentSearch').oninput=e=>{studentSearch=e.target.value;studentPage=1;renderStudentsTable()};$('#studentClass').onchange=e=>{studentClass=e.target.value;studentPage=1;renderStudentsTable()};$('#importStudents').onclick=drawImport;$('#studentExport').onclick=exportStudents;
 renderStudentsTable();
}
function renderStudentsTable(){
 if(!$('#studentTable'))return;
 const all=s.students.filter(st=>!st.archivedFrom), q=studentSearch.toLocaleLowerCase('id');
 const rows=all.filter(st=>(!studentClass||st.className===studentClass)&&`${st.name} ${st.className} ${st.rfid}`.toLocaleLowerCase('id').includes(q)).sort((a,b)=>a.className.localeCompare(b.className)||a.name.localeCompare(b.name,'id'));
 const pages=Math.max(1,Math.ceil(rows.length/25));studentPage=Math.min(studentPage,pages);
 const visible=rows.slice((studentPage-1)*25,studentPage*25);
 $('#studentTable').innerHTML=visible.length?`<div class="table-wrap"><table><thead><tr><th>No.</th><th>Nama siswa</th><th>ID RFID</th><th>Kelas</th><th>Email orang tua</th><th></th></tr></thead><tbody>${visible.map((r,i)=>`<tr><td class="muted">${(studentPage-1)*25+i+1}</td><td><div class="name-cell"><span class="avatar">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b><small>Aktif sejak ${humanDate(r.startDate)}</small></div></div></td><td><span class="rfid">${esc(r.rfid)}</span></td><td><span class="badge neutral">${esc(r.className)}</span></td><td>${r.email?esc(r.email):'<span class="muted">Tidak diisi</span>'}</td><td><button class="icon-button" data-edit="${esc(r.id)}" aria-label="Ubah ${esc(r.name)}">${icon('edit',15)}</button></td></tr>`).join('')}</tbody></table></div><div class="table-foot"><span>${rows.length} siswa ditampilkan • ${all.length} siswa terdaftar</span><div class="button-row"><button class="btn compact" id="studentPrev" ${studentPage===1?'disabled':''}>←</button><span>${studentPage} / ${pages}</span><button class="btn compact" id="studentNext" ${studentPage===pages?'disabled':''}>→</button></div></div>`:empty('Belum ada siswa yang cocok. Tambahkan siswa atau impor Excel.');
 $$('[data-edit]').forEach(el=>el.onclick=()=>openStudent(el.dataset.edit));
 if($('#studentPrev')){$('#studentPrev').onclick=()=>{studentPage--;renderStudentsTable()};$('#studentNext').onclick=()=>{studentPage++;renderStudentsTable()}}
}
function showModal(title,body,footer=''){
 const modal=$('#modal');modal.innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="icon-button" id="closeModal" aria-label="Tutup">${icon('cross',16)}</button></div><div class="modal-body">${body}<div class="modal-error" id="modalError" role="alert"></div></div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
 if(!modal.open)modal.showModal();$('#closeModal').onclick=()=>modal.close();return modal;
}
function openStudent(id){
 const student=s.students.find(st=>st.id===id), r=student||{name:'',rfid:'',className:'',email:'',startDate:today()};
 showModal(student?'Ubah data siswa':'Tambah siswa',`<form id="studentForm" class="form-grid"><div class="field full"><label for="studentName">Nama lengkap siswa</label><input id="studentName" name="name" maxlength="100" required value="${esc(r.name)}" placeholder="Contoh: Ahmad Fauzan"></div><div class="field"><label for="studentRfid">ID RFID</label><input id="studentRfid" name="rfid" maxlength="64" required value="${esc(r.rfid)}" placeholder="Tempelkan kartu di sini" autocomplete="off"><small>Klik kolom ini, lalu tempel kartu USB.</small></div><div class="field"><label for="studentKelas">Kelas</label><select name="className" id="studentKelas" required>${classOptions(r.className,false)}</select></div><div class="field full"><label for="studentEmail">Email orang tua <span class="muted">(opsional)</span></label><input type="email" id="studentEmail" name="email" maxlength="200" value="${esc(r.email)}" placeholder="wali@example.com"><small>Tanpa email, notifikasi tidak dibuat untuk siswa ini.</small></div><div class="field full"><label for="studentStart">Mulai masuk daftar absensi</label><input type="date" id="studentStart" name="startDate" value="${esc(r.startDate)}" ${student?'disabled':'required'} max="${today()}"><small>Alpa otomatis hanya dihitung sejak tanggal ini. Perubahan nama/kelas berlaku mulai hari ini.</small></div></form>`,`${student?`<button class="btn danger" id="archiveStudent" style="margin-right:auto">Arsipkan</button>`:''}<button class="btn" id="cancelModal">Batal</button><button class="btn primary" form="studentForm" type="submit" id="saveStudent">Simpan siswa</button>`);
 $('#cancelModal').onclick=()=>$('#modal').close();
 $('#studentForm').onsubmit=async e=>{
  e.preventDefault();const btn=$('#saveStudent');btn.disabled=true;$('#modalError').textContent='';
  try{const values=Object.fromEntries(new FormData(e.target));if(student)values.startDate=student.startDate;await store.saveStudent(values,id);$('#modal').close();toast('Data siswa berhasil disimpan.')}catch(error){$('#modalError').textContent=readableError(error)}finally{btn.disabled=false}
 };
 // RFID HID mengirim Enter. Saat pendaftaran, Enter cukup mengakhiri pembacaan ID.
 $('#studentRfid').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#studentKelas').focus()}};
 if(student)$('#archiveStudent').onclick=async()=>{if(confirm(`Arsipkan ${student.name}? Riwayat absensi tetap disimpan; kartu dapat dipakai siswa lain.`)){try{await store.archiveStudent(id);$('#modal').close();toast('Siswa diarsipkan.')}catch(error){$('#modalError').textContent=readableError(error)}}};
}
function ensureExcel(){if(!window.XLSX)throw Error('Komponen Excel belum tersedia. Pastikan assets/vendor/xlsx.full.min.js ikut diunggah.');return window.XLSX}
function downloadWorkbook(sheets,name){
 const X=ensureExcel(),wb=X.utils.book_new();
 for(const [title,rows] of sheets){const ws=X.utils.json_to_sheet(rows);const headers=Object.keys(rows[0]||{});ws['!cols']=headers.map(k=>({wch:Math.min(45,Math.max(k.length+3,...rows.slice(0,500).map(r=>String(r[k]??'').length+2)))}));if(ws['!ref'])ws['!autofilter']={ref:ws['!ref']};X.utils.book_append_sheet(wb,ws,title)}
 X.writeFile(wb,name,{bookType:'xlsx',compression:true});
}
function templateExcel(){try{downloadWorkbook([['Data Siswa',[{'Nama Siswa':'Contoh Siswa','ID RFID':'0001234567','Kelas':s.settings.classes[0]||'VII A','Email Orang Tua':'','Tanggal Mulai':today()}]]],'Template_Impor_Siswa.xlsx')}catch(e){toast(e.message,true)}}
function exportStudents(){try{downloadWorkbook([['Data Siswa',s.students.map(r=>({'Nama Siswa':r.name,'ID RFID':r.rfid,'Kelas':r.className,'Email Orang Tua':r.email,'Tanggal Mulai':r.startDate,'Diarsipkan Sejak':r.archivedFrom||'','Mode':store.demo?'DEMO':'PRODUKSI'}))]],`Data_Siswa_${today()}.xlsx`)}catch(e){toast(e.message,true)}}
function drawImport(){
 showModal('Impor data siswa dari Excel',`<div class="notice">Gunakan format template. ID RFID wajib berformat <b>Teks</b> di Excel. Impor ini menambah siswa baru; ID yang sudah terdaftar ditolak agar data tidak tertimpa. Maksimal 200 siswa per berkas.</div><div class="button-row"><button class="btn light" id="downloadTemplate">${icon('down',15)}Unduh template Excel</button></div><div class="field" style="margin-top:20px"><label for="excelInput">Pilih berkas .xlsx / .xls</label><input type="file" id="excelInput" accept=".xlsx,.xls"></div><div id="importPreview"></div>`,`<button class="btn" id="cancelImport">Batal</button><button class="btn primary" id="confirmImport" disabled>Impor siswa valid</button>`);
 importRows=[];$('#downloadTemplate').onclick=templateExcel;$('#cancelImport').onclick=()=>$('#modal').close();$('#excelInput').onchange=previewImport;$('#confirmImport').onclick=commitImport;
}
async function previewImport(e){
 try{
  const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('Ukuran berkas maksimal 5 MB.');
  const X=ensureExcel(),wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:false}),rows=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:true});
  if(!rows.length||rows.length>200)throw Error('Berkas harus berisi 1–200 baris siswa.');
  const header=k=>k.toLowerCase().replace(/[^a-z]/g,''),seen=new Set(),existing=new Set(s.students.filter(st=>!st.archivedFrom).map(st=>st.rfid));
  importRows=rows.map((raw,index)=>{
   let error='',student;const map=Object.fromEntries(Object.entries(raw).map(([k,v])=>[header(k),v]));
   try{if(typeof map.idrfid==='number')throw Error('ID RFID bertipe Angka. Ubah kolom menjadi Teks dan ketik ulang nomor kartu.');
    student=validateStudent({name:map.namasiswa,rfid:map.idrfid,className:map.kelas,email:map.emailorangtua,startDate:map.tanggalmulai||today()},s.settings.classes);
    if(student.startDate>today())throw Error('Tanggal mulai tidak boleh di masa depan.');
    if(existing.has(student.rfid))throw Error('ID RFID sudah terdaftar.');if(seen.has(student.rfid))throw Error('ID RFID duplikat di berkas ini.');seen.add(student.rfid);
   }catch(err){error=err.message}
   return {index:index+2,student,rawName:map.namasiswa||'',error,state:''};
  });renderImportPreview();
 }catch(error){$('#modalError').textContent=readableError(error);$('#confirmImport').disabled=true;importRows=[]}
}
function renderImportPreview(){
 const valid=importRows.filter(r=>!r.error&&!r.state).length;
 $('#importPreview').innerHTML=`<div class="import-summary"><span class="badge success">${valid} siap impor</span><span class="badge danger">${importRows.filter(r=>r.error).length} bermasalah</span><span class="badge info">${importRows.filter(r=>r.state==='saved').length} tersimpan</span></div><div class="table-wrap" style="max-height:260px"><table><thead><tr><th>Baris</th><th>Siswa</th><th>Hasil validasi</th></tr></thead><tbody>${importRows.map(r=>`<tr><td>${r.index}</td><td>${esc(r.student?.name||r.rawName)}</td><td>${r.state==='saved'?badge('Hadir'):r.error?`<span class="row-error">${esc(r.error)}</span>`:'<span class="badge success">Valid</span>'}</td></tr>`).join('')}</tbody></table></div>`;
 $('#confirmImport').disabled=!valid;$('#confirmImport').textContent=valid?`Impor ${valid} siswa valid`:'Impor selesai / tidak ada siswa valid';
}
async function commitImport(){
 $('#confirmImport').disabled=true;$('#excelInput').disabled=true;$('#closeModal').disabled=true;$('#cancelImport').disabled=true;
 const modal=$('#modal'),block=e=>e.preventDefault();modal.addEventListener('cancel',block);
 let count=0;
 for(const row of importRows.filter(r=>!r.error&&!r.state)){
  try{await store.saveStudent(row.student);row.state='saved';count++}catch(error){row.error=readableError(error)}
  renderImportPreview();$('#confirmImport').disabled=true;
 }
 $('#excelInput').disabled=false;$('#closeModal').disabled=false;$('#cancelImport').disabled=false;modal.removeEventListener('cancel',block);renderImportPreview();toast(`${count} siswa berhasil diimpor. Periksa baris bermasalah bila ada.`);
}
function drawScanner(){
 $('#view').innerHTML=pageHead('Ruang Absensi RFID','Tempelkan kartu. Kehadiran tercatat dalam hitungan detik.',`<button class="btn" id="enterKiosk">${icon('expand',15)}Layar penuh</button>`)+
 `<div class="scanner-layout"><section class="scanner-card"><div class="scanner-toolbar"><span class="badge success">${icon('card',13)} USB · HID</span><div class="segmented" aria-label="Mode absensi">${[['auto','Otomatis'],['in','Masuk'],['out','Pulang']].map(([m,t])=>`<button data-mode="${m}" class="${scanMode===m?'selected':''}">${t}</button>`).join('')}</div></div><div class="live-clock" id="liveClock">${current().time}</div><div class="live-date" id="liveDate">${dayLabel(today())} · WIB</div><div class="scan-symbol">${icon('scan',60)}</div><h2>Tempelkan kartu siswa</h2><p>Pembaca USB mengetik ID kartu dan menekan Enter.</p><form class="scan-form" id="scanForm"><label for="scanInput" class="eyebrow muted" style="display:block;margin-bottom:10px">KOLOM PEMBACA KARTU</label><input id="scanInput" class="scan-input" placeholder="Menunggu kartu RFID…" aria-label="ID kartu RFID" autocomplete="off" autocapitalize="characters" maxlength="64"><button class="btn primary" id="scanSubmit" type="submit">${icon('scan',16)}Catat absensi</button></form><div class="scan-state" id="scanState">${icon('shield',11)} Tersimpan ke ${store.demo?'browser demo':'Firebase setelah koneksi dikonfirmasi'}</div><div class="button-row" style="justify-content:center;margin-top:18px"><button class="btn compact" id="enableSound">${icon('volume',13)}${sound?'Suara aktif':'Aktifkan suara'}</button>${store.demo?'<button class="btn light compact" id="demoScan">Coba kartu contoh · 07:10</button>':''}</div><div id="scanResult"></div></section><div class="scanner-side" id="scannerSide"></div></div>`;
 $$('[data-mode]').forEach(b=>b.onclick=()=>{scanMode=b.dataset.mode;$$('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));$('#scanInput').focus()});
 $('#scanForm').onsubmit=e=>{e.preventDefault();const input=$('#scanInput'),rfid=normalizeRfid(input.value);input.value='';if(!rfid)return;enqueueScan(rfid,scanMode);input.focus()};
 $('#enableSound').onclick=()=>{if(!('speechSynthesis'in window)){toast('Browser tidak mendukung suara. Gunakan Chrome atau Edge terbaru.',true);return}sound=!sound;$('#enableSound').innerHTML=icon('volume',13)+(sound?'Suara aktif':'Aktifkan suara');if(sound)speak('Suara absensi diaktifkan');$('#scanInput').focus()};
 $('#enterKiosk').onclick=()=>{document.body.classList.add('full-kiosk');document.documentElement.requestFullscreen?.().catch(()=>{});$('#scanInput').focus()};
 if(store.demo)$('#demoScan').onclick=()=>{
  const unscanned=activeStudents().find(st=>!s.records.some(r=>r.date===today()&&r.studentId===st.id));
  if(!unscanned){toast('Seluruh siswa contoh sudah tercatat. Reset demo untuk mencoba lagi.');return}
  const now=new Date(today()+'T07:10:00+07:00');enqueueScan(unscanned.rfid,'in',now,true);
 };
 renderScannerSide();renderScanResult();setTimeout(()=>$('#scanInput')?.focus(),50);
}
function renderScannerSide(){
 const el=$('#scannerSide');if(!el)return;const schedule=scheduleFor(s.settings,today()),stats=summary(dailyRows());
 el.innerHTML=`<section class="panel"><div class="panel-head"><div><h2>Jadwal hari ini</h2><p>${isSchoolDay(s.settings,today())?'Hari sekolah aktif':'Hari libur • pemindaian ditutup'}</p></div>${icon('clock',19)}</div><div class="time-row"><div><b>Absen masuk</b><span>Tepat waktu s.d. ${esc(schedule.lateAfter)}</span></div><strong>${esc(schedule.entryStart)} – ${esc(schedule.entryEnd)}</strong></div><div class="time-row"><div><b>Absen pulang</b><span>Setelah absen masuk tercatat</span></div><strong>${esc(schedule.exitStart)} – ${esc(schedule.exitEnd)}</strong></div><div class="panel-foot">Waktu menggunakan WIB (Asia/Jakarta). Pastikan jam komputer tersinkron otomatis.</div></section><section class="panel"><div class="panel-head"><div><h2>Baru saja tercatat</h2><p>${stats.present} hadir · ${stats.late} terlambat</p></div><span class="badge success">Live</span></div>${activityHTML(5)}</section><div class="notice">${icon('info',14)} Pembaca harus bertipe <b>USB keyboard/HID</b> dengan akhiran <b>Enter</b>. Klik kolom kartu bila pembaca belum mengetik.</div>`;
}
async function enqueueScan(rfid,mode,now=new Date(),simulation=false){
 if(!/^[A-Z0-9:_-]{3,64}$/.test(rfid)){lastScanResult={error:'Format ID RFID tidak valid.'};renderScanResult();return}
 if(scanQueue.length>=20){toast('Antrean pemindaian penuh. Tunggu kartu sebelumnya selesai.',true);return}
 scanQueue.push({rfid,mode,now,simulation});if(scanRunning)return;scanRunning=true;
 while(scanQueue.length){
  const item=scanQueue.shift();if($('#scanState'))$('#scanState').textContent=`Menyimpan absensi… ${scanQueue.length?'Antrean: '+scanQueue.length:''}`;
  try{
   const result=await store.scan(item.rfid,item.mode,item.now);lastScanResult={...result,simulation:item.simulation};
   if(sound)speak('Absen berhasil');
  }catch(error){lastScanResult={error:readableError(error)}}
  renderScanResult();
 }
 scanRunning=false;if($('#scanState'))$('#scanState').textContent=store.demo?'Data demonstrasi tersimpan di browser.':'Siap membaca kartu berikutnya.';
}
function renderScanResult(){
 const el=$('#scanResult');if(!el||!lastScanResult)return;
 const r=lastScanResult;
 el.innerHTML=r.error?`<div class="scan-result error">${icon('info',23)}<div><b>Absensi belum dicatat</b><p>${esc(r.error)}</p></div></div>`:`<div class="scan-result"><span class="avatar">${icon('check',22)}</span><div><b>Absen ${r.mode==='in'?'masuk':'pulang'} berhasil</b><p>${esc(r.student.name)} · ${esc(r.student.className)} · ${timeOf(r.mode==='in'?r.record.checkInAt:r.record.checkOutAt)}${r.simulation?' · Simulasi jam 07:10':''}</p><p>${r.emailQueued?'Notifikasi masuk antrean email.':store.demo?'Mode demo • tidak mengirim email.':r.student.email?'Notifikasi email tidak diaktifkan untuk peristiwa ini.':'Tanpa email orang tua; notifikasi dilewati.'}</p></div></div>`;
}
function speak(text){
 if(!window.speechSynthesis)return;const utterance=new SpeechSynthesisUtterance(text);utterance.lang='id-ID';utterance.rate=1;const voice=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('id'));if(voice)utterance.voice=voice;speechSynthesis.speak(utterance);
}
function drawReports(){
 if(!report.from){report.from=today();report.to=today();report.records=s.records;report.loaded=true}
 $('#view').innerHTML=pageHead('Rekap Absensi','Semua siswa, semua status. Siap dilihat dan diunduh.',`<button class="btn primary" id="exportReport">${icon('down',16)}Unduh Excel</button>`)+
 `<section class="panel"><div class="filter-grid"><div class="field"><label for="reportFrom">Dari tanggal</label><input type="date" id="reportFrom" value="${report.from}" max="${today()}"></div><div class="field"><label for="reportTo">Sampai tanggal</label><input type="date" id="reportTo" value="${report.to}" max="${today()}"></div><div class="field"><label for="reportClass">Kelas</label><select id="reportClass">${classOptions(report.className)}</select></div><div class="field"><label for="reportStatus">Status kehadiran</label><select id="reportStatus"><option value="">Semua status</option>${Object.keys(STATUS).map(v=>`<option value="${v}" ${v===report.status?'selected':''}>${v}</option>`).join('')}</select></div><button class="btn primary" id="loadReport">${icon('search',15)}Tampilkan</button></div><div id="reportSummary"></div><div id="reportTable"></div></section><div class="notice">Siswa tanpa catatan masuk dihitung <b>Alpa</b> setelah jam masuk berakhir. Izin dan sakit dicatat melalui tombol koreksi. Hari libur dan siswa yang belum terdaftar tidak dihitung sebagai Alpa. Rekap dibatasi <b>31 hari</b> per pengambilan agar penggunaan Firebase terkendali.</div>`;
 $('#loadReport').onclick=loadReport;$('#reportClass').onchange=e=>{report.className=e.target.value;report.page=1;renderReportTable()};$('#reportStatus').onchange=e=>{report.status=e.target.value;report.page=1;renderReportTable()};
 for(const id of ['reportFrom','reportTo'])$('#'+id).onchange=()=>{report.loaded=false;$('#reportSummary').innerHTML='';$('#reportTable').innerHTML=empty('Klik Tampilkan untuk mengambil rentang tanggal baru.','calendar')};
 $('#exportReport').onclick=exportReport;renderReportTable();
}
async function loadReport(){
 const button=$('#loadReport');button.disabled=true;button.textContent='Mengambil…';const request=++report.request;
 try{
  const from=$('#reportFrom').value,to=$('#reportTo').value;dateRange(from,to);if(to>today())throw Error('Tanggal akhir tidak boleh melewati hari ini.');
  const records=from===today()&&to===today()?s.records:await store.loadRange(from,to);
  if(request!==report.request)return;
  Object.assign(report,{from,to,records,loaded:true,page:1});renderReportTable();
 }catch(error){toast(readableError(error),true)}finally{if($('#loadReport')){$('#loadReport').disabled=false;$('#loadReport').innerHTML=icon('search',15)+'Tampilkan'}}
}
function filteredReport(){
 if(!report.loaded)return [];
 return reportRows(s.students,report.records,s.settings,report.from,report.to).filter(r=>(!report.className||r.className===report.className)&&(!report.status||r.status===report.status));
}
function renderReportTable(){
 if(!$('#reportTable')||!report.loaded)return;
 const rows=filteredReport(),st=summary(rows),pages=Math.max(1,Math.ceil(rows.length/50));report.page=Math.min(report.page,pages);
 $('#reportSummary').innerHTML=`<div class="summary-strip"><span><b>${rows.length}</b>catatan</span><span><b>${st.present}</b>hadir</span><span><b>${st.late}</b>terlambat</span><span><b>${st.permit}</b>izin</span><span><b>${st.sick}</b>sakit</span><span><b>${st.absent}</b>alpa</span><span><b>${st.waiting}</b>belum absen</span></div>`;
 const visible=rows.slice((report.page-1)*50,report.page*50);
 $('#reportTable').innerHTML=visible.length?`<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama siswa</th><th>Kelas</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Notifikasi</th><th>Koreksi</th></tr></thead><tbody>${visible.map((r,i)=>`<tr><td>${humanDate(r.date)}</td><td><b>${esc(r.name)}</b>${r.note?`<div class="small muted" style="max-width:210px;white-space:normal;margin-top:5px">${esc(r.note)}</div>`:''}</td><td>${esc(r.className)}</td><td>${timeOf(r.checkInAt)}</td><td>${timeOf(r.checkOutAt)}</td><td>${badge(r.status)}</td><td>${emailStatusHTML(r)}</td><td><button class="icon-button" data-correct="${i}" ${r.date>today()?'disabled':''} aria-label="Koreksi ${esc(r.name)}">${icon('edit',14)}</button></td></tr>`).join('')}</tbody></table></div><div class="table-foot"><span>Menampilkan ${(report.page-1)*50+1}–${Math.min(report.page*50,rows.length)} dari ${rows.length}</span><div class="button-row"><button class="btn compact" id="reportPrev" ${report.page===1?'disabled':''}>←</button><span>${report.page} / ${pages}</span><button class="btn compact" id="reportNext" ${report.page===pages?'disabled':''}>→</button></div></div>`:empty('Tidak ada data pada filter ini.','chart');
 $$('[data-correct]').forEach(b=>b.onclick=()=>openCorrection(visible[Number(b.dataset.correct)]));
 if($('#reportPrev')){$('#reportPrev').onclick=()=>{report.page--;renderReportTable()};$('#reportNext').onclick=()=>{report.page++;renderReportTable()}}
}
function emailStatusHTML(row){
 if(store.demo)return '<span class="email-status">Demo</span>';
 if(row.date!==today())return '<span class="email-status">Antrean ditampilkan<br>untuk hari ini</span>';
 const jobs=s.jobs.filter(j=>j.studentId===row.studentId&&j.date===row.date);
 if(!jobs.length)return `<span class="email-status">${row.email?'Tidak ada antrean':'Tanpa email'}</span>`;
 return jobs.map(j=>`<div class="email-status ${j.state==='sent'?'sent':['review','skipped'].includes(j.state)?'failed':''}">${j.mode==='in'?'Masuk':'Pulang'}: ${{pending:'Antre',processing:'Diproses',sent:'Terkirim',skipped:'Dilewati',review:'Perlu diperiksa'}[j.state]||esc(j.state)}</div>`).join('');
}
function openCorrection(row){
 showModal('Koreksi kehadiran',`<div class="notice"><b>${esc(row.name)}</b> · ${esc(row.className)}<br>${humanDate(row.date)}. Koreksi dicatat sebagai tindakan admin dan tidak membuat email baru.</div><form id="correctionForm" class="form-grid"><div class="field full"><label for="correctionStatus">Status</label><select id="correctionStatus" name="status">${['Hadir','Terlambat','Izin','Sakit','Alpa'].map(v=>`<option ${v===row.status?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="correctIn">Jam masuk</label><input type="time" id="correctIn" name="checkIn" value="${row.checkInAt?timeOf(row.checkInAt):''}"></div><div class="field"><label for="correctOut">Jam pulang <span class="muted">(opsional)</span></label><input type="time" id="correctOut" name="checkOut" value="${row.checkOutAt?timeOf(row.checkOutAt):''}"></div><div class="field full"><label for="correctNote">Alasan koreksi / keterangan izin</label><textarea id="correctNote" name="note" required minlength="5" maxlength="500" placeholder="Jelaskan alasan koreksi…">${esc(row.note)}</textarea></div></form>`,`<button class="btn" id="cancelCorrection">Batal</button><button class="btn primary" form="correctionForm" type="submit" id="saveCorrection">Simpan koreksi</button>`);
 const update=()=>{const absent=['Izin','Sakit','Alpa'].includes($('#correctionStatus').value);$('#correctIn').disabled=absent;$('#correctOut').disabled=absent;$('#correctIn').required=!absent};update();$('#correctionStatus').onchange=update;$('#cancelCorrection').onclick=()=>$('#modal').close();
 $('#correctionForm').onsubmit=async e=>{
  e.preventDefault();const btn=$('#saveCorrection');btn.disabled=true;
  try{
   const values=Object.fromEntries(new FormData(e.target)),present=['Hadir','Terlambat'].includes(values.status);
   if(values.note.trim().length<5)throw Error('Alasan koreksi minimal 5 karakter.');
   const checkInAt=present?new Date(`${row.date}T${values.checkIn}:00+07:00`).toISOString():null,checkOutAt=present&&values.checkOut?new Date(`${row.date}T${values.checkOut}:00+07:00`).toISOString():null;
   if(checkOutAt&&checkOutAt<checkInAt)throw Error('Jam pulang harus sesudah jam masuk.');
   if((checkInAt&&Date.parse(checkInAt)>Date.now())||(checkOutAt&&Date.parse(checkOutAt)>Date.now()))throw Error('Jam koreksi tidak boleh di masa depan.');
   await store.correct(row,{status:values.status,checkInAt,checkOutAt,note:values.note.trim()});
   $('#modal').close();toast('Koreksi kehadiran disimpan.');
   if(report.from!==today()||report.to!==today()){report.records=await store.loadRange(report.from,report.to);renderReportTable()}
  }catch(error){$('#modalError').textContent=readableError(error)}finally{btn.disabled=false}
 };
}
function exportReport(){
 try{
  if(!report.loaded)throw Error('Tampilkan rekap terlebih dahulu.');
  const rows=filteredReport();if(!rows.length)throw Error('Tidak ada data untuk diunduh.');
  const detail=rows.map(r=>({'Tanggal':r.date,'Nama Siswa':r.name,'ID RFID':r.rfid,'Kelas':r.className,'Jam Masuk':r.checkInAt?timeOf(r.checkInAt):'','Jam Pulang':r.checkOutAt?timeOf(r.checkOutAt):'','Status':r.status,'Keterangan':r.note,'Sumber':r.source}));
  const groups=new Map();for(const r of rows){const key=r.studentId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  const total=[...groups.values()].map(rr=>{const st=summary(rr),r=rr.at(-1);return {'Nama Siswa':r.name,'ID RFID':r.rfid,'Kelas Terakhir dalam Rekap':r.className,'Tepat Waktu':rr.filter(r=>r.status==='Hadir').length,'Terlambat':st.late,'Jumlah Hadir':st.present,'Izin':st.permit,'Sakit':st.sick,'Alpa':st.absent,'Belum Absen':st.waiting,'Libur':rr.filter(r=>r.status==='Libur').length,'Persentase Kehadiran':st.rate+'%'}});
  downloadWorkbook([['Detail Absensi',detail],['Ringkasan Siswa',total],['Keterangan',[{'Sekolah':s.settings.schoolName,'Periode':report.from+' s.d. '+report.to,'Filter Kelas':report.className||'Semua','Filter Status':report.status||'Semua','Mode':store.demo?'DEMO - DATA CONTOH':'PRODUKSI','Catatan':'Jumlah Hadir = Tepat Waktu + Terlambat. Persentase mengikuti baris hasil filter; hari libur dikecualikan.','Dicetak':new Date().toISOString()}]]],`Rekap_Absensi_${report.from}_${report.to}.xlsx`);
 }catch(error){toast(readableError(error),true)}
}
function drawSettings(){
 const cfg=s.settings;dirtySettings=false;pendingLogo=null;
 $('#view').innerHTML=pageHead('Pengaturan Sekolah','Sesuaikan identitas, jadwal absensi, dan notifikasi orang tua.')+
 `<form id="settingsForm"><div class="settings-layout"><section class="panel"><div class="panel-head"><div><h2>Identitas & tampilan</h2><p>Ruang absensi dengan identitas sekolah Anda</p></div>${icon('class',20)}</div><div class="form-section form-grid"><div class="field full"><label for="schoolName">Nama sekolah</label><input id="schoolName" name="schoolName" required maxlength="120" value="${esc(cfg.schoolName)}"></div><div class="field full"><label for="schoolSubtitle">Keterangan sekolah</label><input id="schoolSubtitle" name="schoolSubtitle" maxlength="100" value="${esc(cfg.schoolSubtitle)}"></div><div class="field full"><label for="logoFile">Logo sekolah</label><div class="logo-preview"><img id="logoPreview" src="${logo()}" alt="Pratinjau logo"><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp"></div><small>PNG/JPG/WebP, maksimal 3 MB. Logo diperkecil otomatis dan disimpan di Firestore.</small><button type="button" class="btn compact" id="removeLogo" style="align-self:start">Gunakan logo bawaan</button></div><div class="field full"><label for="themeColor">Warna utama</label><div class="color-choice"><input type="color" id="themeColor" name="color" value="${esc(cfg.color)}"><span class="small muted">Pilih warna identitas sekolah</span></div></div><div class="field full"><label for="classList">Daftar kelas</label><textarea id="classList" name="classList" required>${esc(cfg.classes.join('\n'))}</textarea><small>Satu kelas per baris. Kelas yang masih memiliki siswa tidak dapat dihapus.</small></div></div></section>
 <section class="panel"><div class="panel-head"><div><h2>Jadwal kehadiran</h2><p>Zona waktu WIB · Asia/Jakarta</p></div>${icon('clock',20)}</div><div class="form-section form-grid">${[['entryStart','Mulai absen masuk'],['entryEnd','Akhir absen masuk'],['lateAfter','Batas tepat waktu'],['exitStart','Mulai absen pulang'],['exitEnd','Akhir absen pulang']].map(([k,t])=>`<div class="field"><label for="${k}">${t}</label><input type="time" id="${k}" name="${k}" required value="${esc(cfg[k])}"></div>`).join('')}<div class="field full"><label>Hari sekolah aktif</label><div class="checks">${['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map((d,i)=>`<label><input type="checkbox" name="schoolDays" value="${i}" ${cfg.schoolDays.includes(i)?'checked':''}>${d}</label>`).join('')}</div></div><div class="field full"><label for="holidays">Tanggal libur tambahan</label><textarea id="holidays" name="holidays" placeholder="2026-12-25&#10;2027-01-01">${esc(cfg.holidays.join('\n'))}</textarea><small>Satu tanggal YYYY-MM-DD per baris. Perubahan jadwal berlaku mulai hari ini; jadwal terdahulu disimpan.</small></div></div></section>
 <section class="panel" style="grid-column:1/-1"><div class="panel-head"><div><h2>Notifikasi email orang tua</h2><p>Antrean Firebase dibaca Google Apps Script setiap 5 menit</p></div>${icon('mail',20)}</div><div class="form-section"><div class="notice warning">Gmail pribadi melalui Apps Script dibatasi sekitar <b>100 penerima per hari</b>, dibagi dengan skrip lain pada akun yang sama. Tidak ada jaminan email gratis tanpa batas. Periksa kuota akun sebelum mengaktifkan notifikasi untuk seluruh siswa.</div><div class="form-grid"><div class="field"><label class="check-label"><input type="checkbox" id="emailEnabled" name="emailEnabled" ${cfg.emailEnabled?'checked':''} ${store.demo?'disabled':''}>Aktifkan antrean email otomatis</label><small>${store.demo?'Email dinonaktifkan dalam mode demo.':'Aktifkan setelah pengirim Apps Script terpasang. Tanpa email orang tua, antrean tidak dibuat.'}</small></div><div class="field"><label for="notifyEvents">Kirim notifikasi saat</label><select id="notifyEvents" name="notifyEvents"><option value="in" ${cfg.notifyEvents==='in'?'selected':''}>Absen masuk saja (hemat kuota)</option><option value="both" ${cfg.notifyEvents==='both'?'selected':''}>Absen masuk dan pulang</option></select></div></div><p class="small muted" id="emailEstimate"></p><a class="btn light compact" href="./PANDUAN_PEMASANGAN.html#email" target="_blank" rel="noopener">${icon('book',14)}Panduan pengirim email gratis</a></div></section></div>
 <div class="settings-footer"><span class="small muted">Perubahan diterapkan ke seluruh perangkat setelah tersimpan.</span><button class="btn primary" type="submit" id="saveSettings">${icon('check',15)}Simpan pengaturan</button></div></form>`;
 const estimate=()=>{const n=activeStudents().filter(st=>st.email).length,need=n*($('#notifyEvents').value==='both'?2:1);$('#emailEstimate').textContent=`${n} siswa aktif memiliki email. Perkiraan maksimal ${need} penerima/hari. ${need>100?'Perkiraan melebihi kuota Gmail pribadi; sebagian notifikasi akan menunggu atau kedaluwarsa.':'Kuota aktual mengikuti MailApp.getRemainingDailyQuota() pada akun pengirim.'}`};estimate();
 $('#settingsForm').oninput=()=>{dirtySettings=true};$('#settingsForm').onchange=()=>{dirtySettings=true;estimate()};
 $('#logoFile').onchange=prepareLogo;$('#removeLogo').onclick=()=>{pendingLogo='';$('#logoPreview').src='./assets/icon.svg';dirtySettings=true};
 $('#settingsForm').onsubmit=async e=>{
  e.preventDefault();const btn=$('#saveSettings');btn.disabled=true;
  try{
   const f=new FormData(e.target),classes=[...new Set(String(f.get('classList')).split(/[\n,]/).map(v=>v.trim()).filter(Boolean))];
   if(!classes.length||classes.length>60||classes.some(c=>c.length>60))throw Error('Daftar kelas harus berisi 1–60 kelas, masing-masing maksimal 60 karakter.');
   const missing=s.students.filter(st=>!st.archivedFrom&&!classes.includes(st.className));if(missing.length)throw Error(`Kelas ${missing[0].className} masih digunakan oleh siswa. Pindahkan siswa dahulu.`);
   const next={...s.settings,schoolName:f.get('schoolName').trim(),schoolSubtitle:f.get('schoolSubtitle').trim(),color:f.get('color'),logo:pendingLogo===null?s.settings.logo:pendingLogo,classes,schoolDays:f.getAll('schoolDays').map(Number),holidays:[...new Set(String(f.get('holidays')).split(/[\n,]/).map(v=>v.trim()).filter(Boolean))],emailEnabled:!store.demo&&f.get('emailEnabled')==='on',notifyEvents:f.get('notifyEvents')};
   for(const k of ['entryStart','lateAfter','entryEnd','exitStart','exitEnd'])next[k]=f.get(k);
   if(next.schoolName.length<3)throw Error('Nama sekolah minimal 3 karakter.');validateSchedule(next);
   await store.saveSettings(next);dirtySettings=false;pendingLogo=null;toast('Pengaturan sekolah berhasil disimpan.');
  }catch(error){toast(readableError(error),true)}finally{btn.disabled=false}
 };
}
async function prepareLogo(e){
 try{
  const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('Gunakan PNG/JPG/WebP dengan ukuran maksimal 3 MB.');
  const image=await createImageBitmap(file),factor=Math.min(1,240/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();const result=canvas.toDataURL('image/webp',.85);if(result.length>180000)throw Error('Logo terlalu besar setelah diperkecil. Gunakan gambar lebih sederhana.');pendingLogo=result;$('#logoPreview').src=result;dirtySettings=true;
 }catch(error){toast(readableError(error),true)}
}
function showEmailQueue(){
 const labels={pending:'Menunggu',processing:'Sedang diproses',sent:'Terkirim',skipped:'Dilewati',review:'Perlu diperiksa'};
 const rows=[...s.jobs].sort((a,b)=>a.id.localeCompare(b.id));
 showModal('Antrean email hari ini',`<div class="notice">${store.demo?'Mode demo tidak membuat atau mengirim email.':'Email diperiksa oleh Apps Script setiap 5 menit. Terkirim berarti diterima layanan pengirim; periksa folder spam pada email orang tua bila belum terlihat.'}</div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Siswa</th><th>Peristiwa</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(j=>`<tr><td>${esc(s.students.find(st=>st.id===j.studentId)?.name||j.studentId)}${j.note?`<div class="row-error">${esc(j.note)}</div>`:''}</td><td>${j.mode==='in'?'Masuk':'Pulang'}</td><td>${esc(labels[j.state]||j.state)}</td><td>${['processing','review'].includes(j.state)?`<button class="btn compact" data-job="${esc(j.id)}">Periksa</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('Tidak ada antrean email hari ini.','mail')}`);
 $$('[data-job]').forEach(b=>b.onclick=()=>reviewJob(b.dataset.job));
}
function reviewJob(id){
 const job=s.jobs.find(j=>j.id===id);if(!job)return;
 const updated=job.updatedAt?.toDate?job.updatedAt.toDate():new Date(job.updatedAt||0);
 if(job.state==='processing'&&Date.now()-updated.getTime()<10*60000){toast('Pengirim masih memproses antrean ini. Tunggu setidaknya 10 menit sebelum memeriksa.',true);return}
 showModal('Periksa hasil pengiriman',`<div class="notice warning">Buka folder <b>Terkirim</b> pada Gmail pengirim. Pengiriman dapat sudah terjadi meskipun status Firebase belum diperbarui. Kirim ulang hanya jika email benar-benar belum terkirim.</div><p class="small muted">Antrean: <span class="code">${esc(id)}</span></p>`,`<button class="btn" id="markSent">Sudah terkirim</button><button class="btn primary" id="retryEmail">Belum terkirim · Antrekan ulang</button>`);
 const act=async action=>{try{await store.retryJob(id,action);$('#modal').close();toast(action==='sent'?'Status ditandai terkirim.':'Email kembali mengantre.')}catch(error){$('#modalError').textContent=readableError(error)}};
 $('#markSent').onclick=()=>act('sent');$('#retryEmail').onclick=()=>act('pending');
}
function drawHelp(){
 $('#view').innerHTML=pageHead('Panduan Penggunaan','Dari memasang pembaca USB hingga mengirim laporan ke orang tua.',`<a class="btn primary" href="./PANDUAN_PEMASANGAN.html" target="_blank" rel="noopener">${icon('book',15)}Panduan pemasangan</a>`)+
 `<div class="help-grid">${[['card','1. Sambungkan RFID','Gunakan pembaca USB HID/keyboard. Uji di Notepad: saat kartu ditempel, ID harus muncul dan kursor pindah baris.'],['users','2. Isi data siswa','Tambah nama, ID RFID, kelas, dan email orang tua bila ada. Gunakan template Excel untuk impor banyak siswa.'],['scan','3. Buka ruang absensi','Klik Aktifkan suara, lalu klik kolom pembaca. Pemindaian masuk/pulang mengikuti jadwal sekolah.'],['chart','4. Periksa rekap','Gunakan koreksi untuk mencatat Izin, Sakit, atau membetulkan data. Unduh Detail dan Ringkasan dalam Excel.'],['mail','5. Hubungkan email','Pasang email/Code.gs pada Google Apps Script sesuai panduan. Gmail gratis dibatasi kuota; tanpa email orang tua, notifikasi dilewati.'],['shield','6. Jaga akses admin','Data produksi memerlukan login Firebase dan izin admins/{UID}. Logout sesudah menggunakan komputer bersama.']].map(([i,t,p])=>`<section class="help-card">${icon(i,27)}<h3>${t}</h3><p>${p}</p></section>`).join('')}</div><section class="panel"><div class="panel-head"><h2>Catatan operasional</h2></div><div class="panel-inner"><ul class="steps"><li>Masuk ${s.settings.entryStart}–${s.settings.entryEnd}; tepat waktu sampai ${s.settings.lateAfter}. Setelah itu berstatus Terlambat.</li><li>Pulang ${s.settings.exitStart}–${s.settings.exitEnd}. Siswa harus sudah absen masuk.</li><li>Sebelum akhir jendela masuk, siswa tanpa catatan berstatus Belum absen; setelahnya Alpa.</li><li>Internet diperlukan untuk mencatat ke Firebase. Suara berhasil hanya diputar setelah penyimpanan dikonfirmasi.</li><li>Rekap memakai riwayat tanggal mulai, kelas, dan jadwal. Perubahan profil berlaku mulai hari perubahan.</li><li>Email hanya otomatis untuk pemindaian RFID. Koreksi admin tidak mengirim email ulang.</li><li>Mode demo memakai data contoh di browser. Data demo tidak dipindah ke Firebase.</li></ul></div></section>`;
}
function showAuth(error=''){
 document.body.classList.remove('full-kiosk');s=null;
 const configured=!!(firebaseConfig.apiKey&&firebaseConfig.projectId&&firebaseConfig.appId);
 $('#app').innerHTML=`<div class="auth-page"><section class="auth-story"><div class="brand"><img src="./assets/icon.svg" width="42" height="42" alt=""><div><strong>Hadir<span>.</span></strong><small>SCHOOL ATTENDANCE</small></div></div><main><div class="eyebrow" style="color:#7ea89f;margin-bottom:20px">SMP AL-MIFTAH KETAPANG</div><h1>Setiap kehadiran,<br>awal dari<br><span>masa depan.</span></h1><p>Sistem absensi RFID yang membantu sekolah dan orang tua tetap terhubung.</p><div class="auth-feature">${icon('scan',18)}Tempel kartu. Kehadiran tercatat.</div><div class="auth-feature">${icon('chart',18)}Rekap lengkap, siap dalam Excel.</div><div class="auth-feature">${icon('mail',18)}Kabar kehadiran untuk orang tua.</div></main><footer>Hadir v1.0 · Didesain untuk keseharian sekolah</footer></section><section class="auth-content"><div class="auth-form"><img class="school-logo" src="./assets/icon.svg" alt="Logo aplikasi"><h2>${configured?'Selamat datang kembali.':'Ruang sekolah Anda, siap.'}</h2><p>${configured?'Masuk untuk mengelola kehadiran siswa.':'Konfigurasikan Firebase untuk penggunaan sekolah, atau jelajahi tampilan melalui mode demo.'}</p><div id="authError">${error?`<div class="auth-error">${esc(error)}</div>`:''}</div>${configured?`<form id="loginForm"><div class="field"><label for="loginEmail">Email administrator</label><input id="loginEmail" type="email" name="email" autocomplete="username" placeholder="admin@sekolah.sch.id" required></div><div class="field"><label for="loginPassword">Password</label><input id="loginPassword" type="password" name="password" autocomplete="current-password" placeholder="Masukkan password" required></div><button class="btn primary" type="submit" id="loginButton">Masuk ke aplikasi ${icon('arrow',15)}</button></form>`:`<div class="notice">Isi <code>app-config.js</code>, aktifkan Firebase Authentication, lalu pasang Firestore Rules. Langkah lengkap tersedia dalam panduan.</div><a class="btn primary" href="./PANDUAN_PEMASANGAN.html" target="_blank" rel="noopener">${icon('book',16)}Buka panduan pemasangan</a>`}<div class="auth-separator">LIHAT APLIKASINYA TERLEBIH DAHULU</div><button class="btn" id="startDemo">Coba aplikasi demo ${icon('arrow',15)}</button><div class="auth-note">${configured?'Akses terbatas untuk administrator yang terdaftar.':'Belum ada data siswa yang terhubung.'}<br>Demo memakai data fiktif dan tidak mengirim email.</div></div></section></div>`;
 $('#startDemo').onclick=()=>{authUnsubscribe?.();store?.stop();startDemo()};
 if(configured)$('#loginForm').onsubmit=async e=>{
  e.preventDefault();const b=$('#loginButton');b.disabled=true;b.textContent='Menghubungkan…';$('#authError').innerHTML='';
  try{if(!store||store.demo)await connectFirebase();const f=new FormData(e.target);await store.login(f.get('email').trim(),f.get('password'));}
  catch(err){if($('#authError'))$('#authError').innerHTML=`<div class="auth-error">${esc(readableError(err))}</div>`}
  finally{if($('#loginButton')){$('#loginButton').disabled=false;$('#loginButton').innerHTML='Masuk ke aplikasi '+icon('arrow',15)}}
 };
}
function mountStore(){
 s=store.state;lastDate=current().date;shell();store.start(lastDate);unsubscribeData=store.subscribe(onData);applyBrand();updateConnection();draw();
}
function startDemo(){store=createDemoStore();view='dashboard';report={from:'',to:'',className:'',status:'',records:[],loaded:false,page:1,request:0};mountStore()}
async function connectFirebase(){
 store=await createFirebaseStore(firebaseConfig);
 authUnsubscribe=store.watchAuth(async user=>{
  if(!user){showAuth();return}
  try{await store.authorize(user);view='dashboard';mountStore()}
  catch(error){await store.logout();showAuth(readableError(error))}
 });
}
document.addEventListener('keydown',e=>{
 if(view!=='scanner'||!$('#scanInput')||$('#modal').open||e.ctrlKey||e.altKey||e.metaKey)return;
 if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 const input=$('#scanInput');
 if(e.key.length===1){e.preventDefault();input.focus();input.value=(input.value+e.key).slice(0,64)}
 else if(e.key==='Enter'&&input.value){e.preventDefault();$('#scanForm').requestSubmit()}
});
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);
window.addEventListener('beforeunload',e=>{if(dirtySettings||scanRunning){e.preventDefault();e.returnValue=''}});
setInterval(()=>{
 if(!s||!store)return;const c=current();
 if($('#liveClock'))$('#liveClock').textContent=c.time;
 if(c.date!==lastDate){lastDate=c.date;store.start(c.date);if(store.demo)onData(store.state);else{unsubscribeData?.();unsubscribeData=store.subscribe(onData)}if(view==='scanner'&&$('#liveDate'))$('#liveDate').textContent=dayLabel(c.date)+' · WIB'}
 // Alpa virtual berubah setelah akhir jam masuk meskipun belum ada pemindaian baru.
 if(c.time.endsWith(':00')&&s.ready){if(view==='dashboard')drawDashboard();if(view==='reports')renderReportTable();if(view==='scanner')renderScannerSide()}
},1000);
async function boot(){
 if(new URLSearchParams(location.search).get('demo')==='1'){startDemo();return}
 showAuth();
 if(firebaseConfig.apiKey&&firebaseConfig.projectId&&firebaseConfig.appId){try{await connectFirebase()}catch(error){showAuth('Firebase belum dapat dihubungkan. '+readableError(error))}}
}
boot();
