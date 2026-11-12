import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Camera, CheckCircle2, LockKeyhole, RefreshCw, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { roleLabels } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import './MemberProfilePage.css';

function nigeriaToday():string{
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(new Date());
  const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function validBirthDate(yearText:string,monthText:string,dayText:string): string | null {
  if(!/^\d{4}$/.test(yearText)||!/^(0?[1-9]|1[0-2])$/.test(monthText)||
    !/^(0?[1-9]|[12][0-9]|3[01])$/.test(dayText)) return null;
  const year=Number(yearText),month=Number(monthText),day=Number(dayText);
  if(year<1900||year>Number(nigeriaToday().slice(0,4)))return null;
  const maxDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(day>maxDay)return null;
  const value=yearText+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  return value<=nigeriaToday()?value:null;
}
type Profile={user_id:string;personal_name:string;date_of_birth:string;avatar_path:string|null;preferred_theme:'system'|'light'|'dark';updated_at:string};
export default function MemberProfilePage(){
 const {account}=useAuth();
 const [userId,setUserId]=useState('');
 const [profile,setProfile]=useState<Profile|null>(null);
 const [name,setName]=useState('');
 const [birthYear,setBirthYear]=useState('');
 const [birthMonth,setBirthMonth]=useState('');
 const [birthDay,setBirthDay]=useState('');
 const [theme,setTheme]=useState<Profile['preferred_theme']>('system');
 const [photo,setPhoto]=useState<File|null>(null);
 const [picture,setPicture]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const refresh=useCallback(async()=>{
   if(!supabase||!account){setLoading(false);return;}
   setLoading(true);
   try{
    const auth=await supabase.auth.getUser();
    if(auth.error||!auth.data.user){setError('Verify your sign-in before editing your profile.');return;}
    const id=auth.data.user.id;setUserId(id);
    const r=await supabase.from('dli_member_profiles')
      .select('user_id,personal_name,date_of_birth,avatar_path,preferred_theme,updated_at')
      .eq('user_id',id).maybeSingle();
    if(r.error){setError('Your profile could not be loaded securely.');return;}
    const row=(r.data??null) as Profile|null;
    setProfile(row);setName(row?.personal_name??account.full_name);
    setBirthYear(row?.date_of_birth?.slice(0,4)??'');
    setBirthMonth(row?.date_of_birth?.slice(5,7)??'');
    setBirthDay(row?.date_of_birth?.slice(8,10)??'');
    setTheme(row?.preferred_theme??'system');
    setError(null);
    if(row?.avatar_path){
      const image=await supabase.storage.from('dli-member-avatars').download(row.avatar_path);
      if(!image.error&&image.data){
        const url=URL.createObjectURL(image.data);
        setPicture(previous=>{if(previous)URL.revokeObjectURL(previous);return url;});
      }
    }else setPicture(previous=>{if(previous)URL.revokeObjectURL(previous);return null;});
   }catch{setError('Profile service unavailable. Your changes have not been confirmed.');}
   finally{setLoading(false);}
 },[account?.id,account?.full_name]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>()=>{if(picture)URL.revokeObjectURL(picture);},[picture]);

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!supabase||busy||!userId||!account)return;
  const clean=name.trim();
  const dob=validBirthDate(birthYear,birthMonth,birthDay);
  if(clean.length<2||clean.length>160||!dob){
    setError('Enter your name and a valid date of birth.');return;
  }
  if(!profile&&!photo){setError('A profile picture is required to complete first-time onboarding.');return;}
  setBusy(true);setError(null);setNotice(null);
  let avatarPath=profile?.avatar_path??null;
  let justUploaded:string|null=null;
  try{
   if(photo){
    const types:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    const ext=types[photo.type];
    if(!ext||photo.size<1||photo.size>2*1024*1024){
      setError('The profile photo must be JPEG, PNG or WEBP and at most 2 MB.');return;
    }
    justUploaded=userId+'/'+crypto.randomUUID()+'.'+ext;
    const upload=await supabase.storage.from('dli-member-avatars').upload(justUploaded,photo,
      {contentType:photo.type,upsert:false});
    if(upload.error){setError('Could not upload your private profile photo.');return;}
    avatarPath=justUploaded;
   }
   const data={personal_name:clean,date_of_birth:dob,avatar_path:avatarPath,preferred_theme:theme};
   const result=profile
    ? await supabase.from('dli_member_profiles').update(data).eq('user_id',userId).select('user_id').maybeSingle()
    : await supabase.from('dli_member_profiles').insert({user_id:userId,...data}).select('user_id').maybeSingle();
   if(result.error||!result.data){
     if(justUploaded)await supabase.storage.from('dli-member-avatars').remove([justUploaded]);
     setError('Profile save was not confirmed. Refresh before trying again.');return;
   }
   setPhoto(null);setNotice('Your private profile and device-independent preferences were saved.');
   window.dispatchEvent(new CustomEvent('dli-profile-changed'));
   await refresh();
  }catch{
   setError('Profile update could not be confirmed. Refresh before retrying.');
  }finally{setBusy(false);}
 }
 const themeOptions=[['system','Follow my device'],['light','Light mode'],['dark','Dark mode']] as const;
 return <div className="module-page member-profile-page">
  <div className="module-page-hero"><span className="module-page-icon"><UserRound size={25}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> MY ACCOUNT</div>
    <h1>My profile &amp; preferences</h1>
    <p>Complete your personal details once and use the same profile when you sign in on another device.</p>
   </div></div>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={18}/></div><div>
    <strong>Private account details</strong>
    <p>Only you can read and edit your birth date and private profile photo. Your Admin-approved role and
      registered email are not editable here. For a name correction to your institutional account, contact an administrator.</p>
   </div></div>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
  {notice&&<p><Link className="user-outline-button" to="/">Open my DLI dashboard</Link></p>}
  <section className="panel member-profile-main">
   <div className="panel-heading"><div><p className="section-kicker">PERSONAL DETAILS</p>
    <h2>{profile?'Your saved profile':'Complete your profile'}</h2>
    <p className="user-caption">A profile picture is required during first-time onboarding. You can change it later. DLI cloud storage supports cross-device sign-in; Google Drive syncing requires a separate authorised connection.</p>
   </div><button type="button" className="user-outline-button" onClick={()=>void refresh()} disabled={loading||busy}><RefreshCw size={15}/> Refresh</button></div>
   <form className="member-profile-form" onSubmit={e=>void save(e)}>
    <div className="member-profile-photo">
      {picture?<img src={picture} alt="Your private profile photo"/>:<span><UserRound size={32}/></span>}
      <div><label htmlFor="member-photo"><Camera size={16}/> Profile picture {profile?'(change optional)':'(required for first login)'}</label>
        <input id="member-photo" type="file" required={!profile&&!picture} accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={e=>setPhoto(e.target.files?.[0]??null)}/>
        <small>JPEG, PNG or WEBP, maximum 2 MB</small>
      </div>
    </div>
    <label htmlFor="member-profile-name">Full name</label>
    <input id="member-profile-name" required minLength={2} maxLength={160} autoComplete="name"
      value={name} onChange={e=>setName(e.target.value)}/>
    <label htmlFor="member-profile-birth-day">Date of birth</label>
    <div className="member-profile-birth-fields">
      <div><label htmlFor="member-profile-birth-day">Day</label>
        <select id="member-profile-birth-day" required value={birthDay}
          onChange={e=>setBirthDay(e.target.value)}>
          <option value="">Day</option>
          {Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={String(day).padStart(2,'0')}>{day}</option>)}
        </select></div>
      <div><label htmlFor="member-profile-birth-month">Month</label>
        <select id="member-profile-birth-month" required value={birthMonth}
          onChange={e=>setBirthMonth(e.target.value)}>
          <option value="">Month</option>
          {MONTHS.map((month,i)=><option key={month} value={String(i+1).padStart(2,'0')}>{month}</option>)}
        </select></div>
      <div><label htmlFor="member-profile-birth-year">Year</label>
        <input id="member-profile-birth-year" type="number" inputMode="numeric"
          required min={1900} max={Number(nigeriaToday().slice(0,4))}
          placeholder="YYYY" value={birthYear} onChange={e=>setBirthYear(e.target.value)}/></div>
    </div>
    <small className="member-profile-date-help">Choose day and month, then type the four-digit year. No scrolling through years.</small>
    <label htmlFor="member-profile-theme">Display preference (synced across devices)</label>
    <select id="member-profile-theme" value={theme} onChange={e=>setTheme(e.target.value as Profile['preferred_theme'])}>
      {themeOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}
    </select>
    <button type="submit" className="academic-submit" disabled={loading||busy}>
      <Save size={16}/>{busy?'Saving profile…':'Save my profile'}
    </button>
   </form>
  </section>
  <section className="panel member-profile-identity">
    <div className="panel-heading"><div><p className="section-kicker">VERIFIED INSTITUTIONAL ACCESS</p>
      <h2>Assigned by DLI administration</h2></div></div>
    <p><LockKeyhole size={15}/> Registered email: <strong>{account?.email}</strong></p>
    <p><CheckCircle2 size={15}/> Authorised role: <strong>{account?roleLabels[account.role]:''}</strong></p>
    <p><ShieldCheck size={15}/> Account: <strong>Active and email verified</strong></p>
    <Link to="/change-password">Change your password securely</Link>
  </section>
 </div>;
}
