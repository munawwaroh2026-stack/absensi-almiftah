import {DEFAULT_SETTINGS,schoolClock,validateStudent,updatedStudent,scanTransition,emailJob,withScheduleHistory,enrolled} from './core.js';

const DEMO_KEY='hadir-almiftah-demo-v1';
const clone=v=>JSON.parse(JSON.stringify(v));

export function createDemoStore(storage=localStorage) {
  let data;
  try { data=JSON.parse(storage.getItem(DEMO_KEY)); } catch {}
  const date=schoolClock().date;
  if(!data || data.version!==1) {
    const names=['Ahmad Fauzan','Naila Safitri','Muhammad Faris','Zahra Aulia','Rizky Maulana','Putri Ramadhani','Fikri Hidayat','Aisyah Rahma','Dimas Pratama','Salma Khairunnisa','Rafi Alamsyah','Nurul Azizah','Arif Rahman','Siti Halimah','Ilham Akbar','Dina Amalia','Faiz Abdullah','Hana Salsabila','Hasan Basri','Nisa Fitriana','Yusuf Hakim','Alya Nadhira','Zaki Firmansyah','Laila Zahira'];
    const students=names.map((name,i)=>({id:`demo${String(i+1).padStart(2,'0')}`,...updatedStudent(null,{name,rfid:`001000${String(i+1).padStart(2,'0')}`,className:DEFAULT_SETTINGS.classes[Math.floor(i/4)],email:i<6?`wali${i+1}@example.com`:'',startDate:date.slice(0,8)+'01'},date)}));
    const records=students.slice(0,20).map((s,i)=>({studentId:s.id,date,name:s.name,className:s.className,rfid:s.rfid,status:i<14?'Hadir':i<17?'Terlambat':i<19?'Izin':'Sakit',checkInAt:i<17?`${date}T${i<14?'07:05:00':'07:28:00'}+07:00`:null,checkOutAt:null,note:i>=17?'Contoh data demonstrasi':'',source:'Demo'}));
    data={version:1,students,records,jobs:[],settings:clone(DEFAULT_SETTINGS)};
  }
  let listener=()=>{};
  const store={demo:true,user:{uid:'demo',email:'admin-demo@example.com'},state:{...data,ready:true,online:true},
    subscribe(fn){listener=fn;fn(this.state);return()=>{listener=()=>{}}},
    start(){this.emit()},stop(){listener=()=>{}},
    emit(){this.state={...data,ready:true,online:true};storage.setItem(DEMO_KEY,JSON.stringify(data));listener(this.state)},
    async login(){},async logout(){},
    async loadRange(from,to){return data.records.filter(r=>r.date>=from&&r.date<=to)},
    async saveStudent(value,id){
      const input=validateStudent(value,data.settings.classes), old=data.students.find(s=>s.id===id);
      if(data.students.some(s=>s.id!==id && !s.archivedFrom && s.rfid===input.rfid)) throw Error('ID RFID sudah digunakan siswa lain.');
      const next={...updatedStudent(old,input,schoolClock(new Date(),data.settings.timezone).date),id:id||crypto.randomUUID()};
      if(id) data.students=data.students.map(s=>s.id===id?next:s); else data.students.push(next);
      this.emit();return next;
    },
    async archiveStudent(id){const s=data.students.find(s=>s.id===id);if(s)s.archivedFrom=schoolClock(new Date(),data.settings.timezone).date;this.emit()},
    async scan(rfid,mode='auto',now=new Date()){
      const student=data.students.find(s=>s.rfid===rfid&&!s.archivedFrom);if(!student)throw Error('Kartu belum terdaftar. Tambahkan di Data Siswa.');
      const date=schoolClock(now,data.settings.timezone).date;
      const record=data.records.find(r=>r.date===date&&r.studentId===student.id);
      const t=scanTransition({record,student,settings:data.settings,now,requestedMode:mode});
      data.records=data.records.filter(r=>!(r.date===date&&r.studentId===student.id));data.records.push(t.record);
      this.emit();return {...t,student,emailQueued:false};
    },
    async correct(row,patch){
      const previous=data.records.find(r=>r.date===row.date&&r.studentId===row.studentId);
      const record={...previous,...row,...patch,source:'Koreksi',updatedAt:new Date().toISOString()};
      delete record.id;delete record.emailIn;delete record.emailOut;delete record.email;
      data.records=data.records.filter(r=>!(r.date===row.date&&r.studentId===row.studentId));data.records.push(record);this.emit();
    },
    async saveSettings(next){data.settings=withScheduleHistory(data.settings,next,schoolClock(new Date(),data.settings.timezone).date);data.settings.emailEnabled=false;this.emit()},
    async retryJob(){throw Error('Mode demo tidak mengirim email.')},
    reset(){storage.removeItem(DEMO_KEY)}
  };
  return store;
}

export async function createFirebaseStore(config) {
  // Versi SDK dipatok agar pembaruan CDN tidak mengubah aplikasi secara otomatis.
  const base='https://www.gstatic.com/firebasejs/12.6.0/';
  const [appSDK,authSDK,f]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  const app=appSDK.initializeApp(config), auth=authSDK.getAuth(app), db=f.getFirestore(app);
  await authSDK.setPersistence(auth,authSDK.browserSessionPersistence);
  let subscriptions=[], listener=()=>{}, ready=new Set(), online=new Map();
  let state={students:[],records:[],jobs:[],settings:clone(DEFAULT_SETTINGS),ready:false,online:false};
  let listeningDate='';
  const store={demo:false,get user(){return auth.currentUser},get state(){return state},
    watchAuth(fn){return authSDK.onAuthStateChanged(auth,fn)},
    async authorize(user){const r=await f.getDocFromServer(f.doc(db,'admins',user.uid));if(!r.exists()||r.data().active!==true)throw Error('Akun belum diberi akses admin. Tambahkan UID akun pada koleksi admins sesuai panduan.')},
    login(email,password){return authSDK.signInWithEmailAndPassword(auth,email,password)},
    logout(){this.stop();return authSDK.signOut(auth)},
    subscribe(fn){listener=fn;fn(state);return()=>{listener=()=>{}}},
    emit(){state.ready=ready.size===4;state.online=[...online.values()].every(Boolean)&&online.size===4;listener({...state})},
    start(date){
      this.stop();listeningDate=date;ready=new Set();online=new Map();
      state={students:[],records:[],jobs:[],settings:clone(DEFAULT_SETTINGS),ready:false,online:false};
      const listen=(key,ref,isDoc=false)=>f.onSnapshot(ref,{includeMetadataChanges:true},snap=>{
        if(isDoc)state.settings={...clone(DEFAULT_SETTINGS),...(snap.exists()?snap.data():{})};
        else state[key]=snap.docs.map(d=>({...d.data(),id:d.id}));
        ready.add(key);online.set(key,!snap.metadata.fromCache);this.emit();
      },error=>{state.error=error.message;state.online=false;listener({...state})});
      subscriptions=[listen('students',f.collection(db,'students')),listen('records',f.query(f.collection(db,'attendance'),f.where('date','==',date))),listen('jobs',f.query(f.collection(db,'emailOutbox'),f.where('date','==',date))),listen('settings',f.doc(db,'config','school'),true)];
    },
    stop(){subscriptions.forEach(fn=>fn());subscriptions=[]},
    async loadRange(from,to){
      const snap=await f.getDocsFromServer(f.query(f.collection(db,'attendance'),f.where('date','>=',from),f.where('date','<=',to)));
      return snap.docs.map(d=>({...d.data(),id:d.id}));
    },
    async saveStudent(value,id){
      const input=validateStudent(value,state.settings.classes), ref=id?f.doc(db,'students',id):f.doc(f.collection(db,'students'));
      await f.runTransaction(db,async tx=>{
        const previous=await tx.get(ref), old=previous.exists()?previous.data():null;
        if(id&&!old)throw Error('Siswa tidak ditemukan. Muat ulang data.');
        if(old?.archivedFrom)throw Error('Siswa yang diarsipkan tidak dapat diubah.');
        const cardRef=f.doc(db,'cards',input.rfid), card=await tx.get(cardRef);
        if(card.exists()&&card.data().studentId!==ref.id)throw Error('ID RFID sudah digunakan siswa lain.');
        let oldCard=null;
        if(old && old.rfid!==input.rfid)oldCard=await tx.get(f.doc(db,'cards',old.rfid));
        const next=updatedStudent(old,input,schoolClock(new Date(),state.settings.timezone).date);
        tx.set(ref,{...next,updatedAt:f.serverTimestamp()});
        tx.set(cardRef,{studentId:ref.id});
        if(oldCard?.exists() && oldCard.data().studentId===ref.id)tx.delete(oldCard.ref);
      });
      return {id:ref.id,...input};
    },
    async archiveStudent(id){
      await f.runTransaction(db,async tx=>{
        const ref=f.doc(db,'students',id), snap=await tx.get(ref);if(!snap.exists())throw Error('Siswa tidak ditemukan.');
        const s=snap.data(), card=await tx.get(f.doc(db,'cards',s.rfid));
        tx.update(ref,{archivedFrom:schoolClock(new Date(),state.settings.timezone).date,updatedAt:f.serverTimestamp()});
        if(card.exists()&&card.data().studentId===id)tx.delete(card.ref);
      });
    },
    async scan(rfid,requestedMode='auto',now=new Date()){
      if(!navigator.onLine)throw Error('Internet terputus. Absen belum disimpan. Sambungkan internet lalu pindai ulang.');
      const date=schoolClock(now,state.settings.timezone).date;
      return f.runTransaction(db,async tx=>{
        const card=await tx.get(f.doc(db,'cards',rfid));if(!card.exists())throw Error('Kartu belum terdaftar. Tambahkan di Data Siswa.');
        const studentSnap=await tx.get(f.doc(db,'students',card.data().studentId));if(!studentSnap.exists())throw Error('Data siswa tidak ditemukan.');
        const student={...studentSnap.data(),id:studentSnap.id};
        const conf=await tx.get(f.doc(db,'config','school')), settings={...clone(DEFAULT_SETTINGS),...(conf.exists()?conf.data():{})};
        const actualDate=schoolClock(now,settings.timezone).date;
        if(actualDate!==date)throw Error('Zona waktu sekolah berubah. Muat ulang halaman.');
        const recordRef=f.doc(db,'attendance',`${date}_${student.id}`), snap=await tx.get(recordRef);
        const t=scanTransition({record:snap.exists()?snap.data():null,student,settings,now,requestedMode});
        const jobRef=f.doc(db,'emailOutbox',`${date}_${student.id}_${t.mode}`), jobSnap=await tx.get(jobRef);
        const job=emailJob(t,student,settings,f.serverTimestamp());
        tx.set(recordRef,{...t.record,updatedAt:f.serverTimestamp(),editedBy:auth.currentUser.uid});
        if(job&&!jobSnap.exists())tx.set(jobRef,job);
        return {...t,student,emailQueued:!!job};
      });
    },
    async correct(row,patch){
      await f.runTransaction(db,async tx=>{
        const ref=f.doc(db,'attendance',`${row.date}_${row.studentId}`), prior=await tx.get(ref);
        // Koreksi memakai data terakhir agar absen pulang dari perangkat lain tidak tertimpa.
        if(prior.exists() && (prior.data().checkInAt!==row.checkInAt || prior.data().checkOutAt!==row.checkOutAt || prior.data().status!==row.status))throw Error('Data telah berubah di perangkat lain. Muat ulang rekap, lalu ulangi koreksi.');
        tx.set(ref,{studentId:row.studentId,date:row.date,name:row.name,className:row.className,rfid:row.rfid,...patch,source:'Koreksi',updatedAt:f.serverTimestamp(),editedBy:auth.currentUser.uid});
      });
    },
    async saveSettings(next){
      await f.runTransaction(db,async tx=>{
        const ref=f.doc(db,'config','school'), old=await tx.get(ref);
        const current={...clone(DEFAULT_SETTINGS),...(old.exists()?old.data():{})};
        if(next.timezone!==current.timezone)throw Error('Zona waktu instalasi ini dikunci agar riwayat absensi tetap konsisten.');
        const merged=withScheduleHistory(current,next,schoolClock(new Date(),current.timezone).date);
        if((merged.scheduleHistory||[]).length>200)throw Error('Riwayat jadwal penuh. Hubungi pengelola data.');
        tx.set(ref,{...merged,updatedAt:f.serverTimestamp()});
      });
    },
    async retryJob(id,action='pending'){
      await f.runTransaction(db,async tx=>{
        const ref=f.doc(db,'emailOutbox',id), job=await tx.get(ref);if(!job.exists())throw Error('Antrean tidak ditemukan.');
        if(!['review','processing'].includes(job.data().state))throw Error('Antrean ini tidak memerlukan pemeriksaan.');
        tx.update(ref,{state:action,note:action==='sent'?'Admin memverifikasi email sudah terkirim.':'Admin meminta kirim ulang setelah pemeriksaan.',updatedAt:f.serverTimestamp()});
      });
    }
  };
  return store;
}
