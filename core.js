export const DEFAULT_SETTINGS = {
  schoolName: 'SMP AL-MIFTAH KETAPANG', schoolSubtitle: 'Sistem Absensi Siswa',
  color: '#149b85', logo: '', timezone: 'Asia/Jakarta',
  classes: ['VII A','VII B','VIII A','VIII B','IX A','IX B'],
  entryStart: '07:00', lateAfter: '07:15', entryEnd: '08:00',
  exitStart: '10:00', exitEnd: '12:00',
  schoolDays: [1,2,3,4,5,6], holidays: [], emailEnabled: false,
  notifyEvents: 'in', scheduleHistory: []
};
export const STATUS = {Hadir:'success',Terlambat:'warning',Izin:'info',Sakit:'purple',Alpa:'danger','Belum absen':'neutral',Libur:'neutral','Belum berlangsung':'neutral'};
export const normalizeRfid = v => String(v ?? '').trim().replace(/\s+/g,'').toUpperCase();
export const validEmail = v => !v || /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v);
export const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function schoolClock(now = new Date(), timezone = 'Asia/Jakarta') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export const minutes = s => Number(s.slice(0,2))*60 + Number(s.slice(3,5));
export function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
export function scheduleFor(settings, date) {
  const h = (settings.scheduleHistory || []).filter(x=>x.fromDate<=date).sort((a,b)=>a.fromDate.localeCompare(b.fromDate));
  return {...settings,...(h.at(-1)||{})};
}
export function isSchoolDay(settings,date) {
  const s=scheduleFor(settings,date);
  return s.schoolDays.includes(new Date(date+'T12:00:00Z').getUTCDay()) && !s.holidays.includes(date);
}
export function validateSchedule(s) {
  const fields=['entryStart','lateAfter','entryEnd','exitStart','exitEnd'];
  if(fields.some(k=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k]||''))) throw Error('Format jam harus HH:MM.');
  if(!(minutes(s.entryStart)<=minutes(s.lateAfter) && minutes(s.lateAfter)<=minutes(s.entryEnd) && minutes(s.entryEnd)<minutes(s.exitStart) && minutes(s.exitStart)<=minutes(s.exitEnd))) throw Error('Urutan jam: mulai masuk ≤ batas tepat waktu ≤ akhir masuk < mulai pulang ≤ akhir pulang.');
  if(!s.schoolDays.length) throw Error('Pilih minimal satu hari sekolah.');
  if((s.holidays||[]).some(x=>!isDate(x))) throw Error('Tanggal libur harus YYYY-MM-DD.');
}
export function validateStudent(value, classes) {
  const s={name:String(value.name||'').trim(),rfid:normalizeRfid(value.rfid),className:String(value.className||'').trim(),email:String(value.email||'').trim().toLowerCase(),startDate:String(value.startDate||'')};
  if(s.name.length<2 || s.name.length>100) throw Error('Nama siswa harus 2–100 karakter.');
  if(!/^[A-Z0-9:_-]{3,64}$/.test(s.rfid)) throw Error('ID RFID harus 3–64 huruf/angka; titik dua, _ dan - diizinkan.');
  if(!classes.includes(s.className)) throw Error('Kelas belum terdaftar. Tambahkan kelas di Pengaturan.');
  if(!validEmail(s.email) || s.email.length>200) throw Error('Email orang tua tidak valid. Isi satu alamat atau kosongkan.');
  if(!isDate(s.startDate)) throw Error('Tanggal mulai siswa tidak valid.');
  return s;
}
export function profileFor(student,date) {
  const h=(student.profileHistory||[]).filter(x=>x.fromDate<=date).sort((a,b)=>a.fromDate.localeCompare(b.fromDate));
  return {...student,...(h.at(-1)||{})};
}
export const enrolled = (s,date) => s.startDate<=date && (!s.archivedFrom || date<s.archivedFrom);
export function scanTransition({record,student,settings,now=new Date(),requestedMode='auto'}) {
  const c=schoolClock(now,settings.timezone), s=scheduleFor(settings,c.date);
  if(!enrolled(student,c.date)) throw Error('Siswa belum aktif atau sudah diarsipkan.');
  if(!isSchoolDay(settings,c.date)) throw Error('Hari ini bukan hari sekolah. Periksa Pengaturan.');
  let mode=requestedMode;
  if(mode==='auto') mode=c.minutes>=minutes(s.entryStart)&&c.minutes<=minutes(s.entryEnd)?'in':c.minutes>=minutes(s.exitStart)&&c.minutes<=minutes(s.exitEnd)?'out':null;
  if(!mode || (mode==='in' && (c.minutes<minutes(s.entryStart)||c.minutes>minutes(s.entryEnd))) || (mode==='out' && (c.minutes<minutes(s.exitStart)||c.minutes>minutes(s.exitEnd)))) throw Error(`Di luar jadwal. Masuk ${s.entryStart}–${s.entryEnd}; pulang ${s.exitStart}–${s.exitEnd}.`);
  if(record && ['Izin','Sakit','Alpa'].includes(record.status)) throw Error(`Status siswa ${record.status}. Koreksi dahulu melalui Rekap Absensi.`);
  if(mode==='in' && record?.checkInAt) throw Error('Siswa sudah absen masuk hari ini.');
  if(mode==='out' && !record?.checkInAt) throw Error('Siswa belum absen masuk. Catat masuk melalui koreksi admin bila diperlukan.');
  if(mode==='out' && record?.checkOutAt) throw Error('Siswa sudah absen pulang hari ini.');
  const p=profileFor(student,c.date);
  return {mode,date:c.date,record:{...(record||{}),studentId:student.id,date:c.date,name:p.name,className:p.className,rfid:p.rfid,status:mode==='in'?(c.minutes>minutes(s.lateAfter)?'Terlambat':'Hadir'):record.status,checkInAt:mode==='in'?now.toISOString():record.checkInAt,checkOutAt:mode==='out'?now.toISOString():null,note:record?.note||'',source:'RFID'}};
}
export function dateRange(from,to,max=31) {
  if(!isDate(from)||!isDate(to)||from>to) throw Error('Pilih rentang tanggal yang benar.');
  const n=(Date.parse(to)-Date.parse(from))/86400000+1;
  if(n>max) throw Error(`Maksimal ${max} hari per pengambilan rekap. Unduh per bulan.`);
  return Array.from({length:n},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
}
export function reportRows(students,records,settings,from,to,now=new Date()) {
  const clock=schoolClock(now,settings.timezone), result=[];
  const byDay=new Map(records.map(r=>[`${r.date}_${r.studentId}`,r]));
  for(const date of dateRange(from,to)) {
    for(const student of students) {
      const r=byDay.get(`${date}_${student.id}`);
      if(!enrolled(student,date) && !r) continue;
      const p=profileFor(student,date), schedule=scheduleFor(settings,date);
      const status=r?.status || (!isSchoolDay(settings,date)?'Libur':date>clock.date?'Belum berlangsung':date===clock.date&&clock.minutes<=minutes(schedule.entryEnd)?'Belum absen':'Alpa');
      result.push({id:`${date}_${student.id}`,studentId:student.id,date,name:r?.name||p.name,className:r?.className||p.className,rfid:r?.rfid||p.rfid,email:p.email,status,checkInAt:r?.checkInAt||null,checkOutAt:r?.checkOutAt||null,note:r?.note||'',source:r?.source||'Otomatis',emailIn:`${date}_${student.id}_in`,emailOut:`${date}_${student.id}_out`});
    }
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.className.localeCompare(b.className)||a.name.localeCompare(b.name,'id'));
}
export function summary(rows) {
  const count=status=>rows.filter(r=>r.status===status).length;
  const present=count('Hadir')+count('Terlambat');
  const schoolTotal=rows.filter(r=>!['Libur','Belum berlangsung'].includes(r.status)).length;
  return {total:rows.length,present,late:count('Terlambat'),absent:count('Alpa'),permit:count('Izin'),sick:count('Sakit'),waiting:count('Belum absen'),rate:schoolTotal?Math.round(present/schoolTotal*100):0};
}
export function updatedStudent(current,input,date) {
  const base=current||{profileHistory:[],archivedFrom:'',createdDate:date};
  if(current && input.startDate!==current.startDate) throw Error('Tanggal mulai hanya ditetapkan saat menambah siswa.');
  const history=(base.profileHistory||[]).filter(h=>h.fromDate!==date);
  history.push({fromDate:current?date:input.startDate,name:input.name,rfid:input.rfid,className:input.className,email:input.email});
  if(history.length>200) throw Error('Riwayat perubahan siswa penuh. Hubungi pengelola data.');
  return {...base,...input,profileHistory:history};
}
export function withScheduleHistory(current,next,date) {
  validateSchedule(next);
  const pick=s=>Object.fromEntries(['entryStart','lateAfter','entryEnd','exitStart','exitEnd','schoolDays','holidays'].map(k=>[k,s[k]]));
  let history=[...(current.scheduleHistory||[])];
  if(!history.length) history.push({fromDate:'2000-01-01',...pick(current)});
  if(JSON.stringify(pick(current))!==JSON.stringify(pick(next))) history=[...history.filter(h=>h.fromDate!==date),{fromDate:date,...pick(next)}];
  return {...next,scheduleHistory:history};
}
export function emailJob(transition,student,settings,createdAt) {
  if(!settings.emailEnabled || !student.email || (transition.mode==='out' && settings.notifyEvents!=='both')) return null;
  return {studentId:student.id,date:transition.date,mode:transition.mode,state:'pending',createdAt,updatedAt:createdAt,note:''};
}
