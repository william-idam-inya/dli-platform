import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Camera, CheckCircle2, LockKeyhole, RefreshCw, Save, ShieldCheck, UserRound, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { roleLabels } from '../auth/permissions';
import { supabase } from '../lib/supabase';
import ProfilePhotoEditor from '../components/ProfilePhotoEditor';
import RoleProfileFields from '../components/RoleProfileFields';
import BrowserAlertPermission from '../components/BrowserAlertPermission';
import AppearancePreferences from '../components/AppearancePreferences';
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
 const [photoStatus,setPhotoStatus]=useState<string|null>(null);

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
        setPhotoStatus(null);
      }else{
        setPicture(previous=>{if(previous)URL.revokeObjectURL(previous);return null;});
        setPhotoStatus('A picture is registered to your account, but private cloud storage could not display it. Try Refresh or upload a replacement.');
      }
    }else {
      setPicture(previous=>{if(previous)URL.revokeObjectURL(previous);return null;});
      setPhotoStatus('No photo is currently saved to this profile.');
    }
   }catch{setError('Profile service unavailable. Your changes have not been confirmed.');}
   finally{setLoading(false);}
 },[account?.id,account?.full_name]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>()=>{if(picture)URL.revokeObjectURL(picture);},[picture]);

 async function uploadPhoto(cropped:Blob){
  if(!supabase||!account||!userId||busy||loading)throw new Error('Your account is not ready. Refresh your profile and try again.');
  const clean=name.trim(),dob=validBirthDate(birthYear,birthMonth,birthDay);
  if(!profile&&(!dob||clean.length<2||clean.length>160))
   throw new Error('Complete your full name and date of birth first, then upload your first profile photo.');
  if(!cropped.size||cropped.size>2*1024*1024)
   throw new Error('Your cropped photo is too large. Choose another image.');
  const client=supabase;
  const path=userId+'/'+crypto.randomUUID()+'.jpg';
  let uploaded=false,linked=false;
  setBusy(true);setError(null);setNotice(null);setPhotoStatus('Uploading photo securely…');
  try{
   // A new object key avoids overwriting an existing private photo.
   const upload=await client.storage.from('dli-member-avatars').upload(path,cropped,
     {contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
   if(upload.error)throw new Error('Photo upload was not accepted by secure storage. Check your connection and retry.');
   uploaded=true;setPhotoStatus('Saving photo to your profile…');
   const result=profile
    ?await client.from('dli_member_profiles').update({avatar_path:path})
      .eq('user_id',userId).select('user_id,avatar_path').maybeSingle()
    :await client.from('dli_member_profiles').insert({
       user_id:userId,personal_name:clean,date_of_birth:dob!,avatar_path:path,preferred_theme:theme,
      }).select('user_id,avatar_path').maybeSingle();
   if(result.error||result.data?.avatar_path!==path)
    throw new Error('The photo reached storage, but your profile could not be updated. Please retry.');
   linked=true;setPhotoStatus('Verifying your saved photo…');
   const checked=await client.from('dli_member_profiles')
     .select('avatar_path').eq('user_id',userId).maybeSingle();
   if(checked.error||checked.data?.avatar_path!==path)
    throw new Error('The photo was saved, but its profile link could not be verified. Refresh your profile before uploading again.');
   const stored=await client.storage.from('dli-member-avatars').download(path);
   if(stored.error||!stored.data)
    throw new Error('The photo was saved, but its private preview could not be loaded. Refresh your profile before uploading again.');
   const pictureUrl=URL.createObjectURL(stored.data);
   setPicture(previous=>{if(previous)URL.revokeObjectURL(previous);return pictureUrl;});
   setProfile(previous=>previous?{...previous,avatar_path:path}:{
      user_id:userId,personal_name:clean,date_of_birth:dob!,avatar_path:path,
      preferred_theme:theme,updated_at:new Date().toISOString(),
   });
   setPhoto(null);setPhotoStatus('Photo uploaded and verified in private cloud storage.');
   setNotice('Profile photo saved. Your picture should now appear in the top-right account circle.');
   window.dispatchEvent(new CustomEvent('dli-profile-changed'));
   // Best-effort cleanup of an old unreferenced image; does not block success.
   if(profile?.avatar_path&&profile.avatar_path!==path)
     void client.storage.from('dli-member-avatars').remove([profile.avatar_path]);
  }catch(cause){
   if(uploaded&&!linked)await client.storage.from('dli-member-avatars').remove([path]);
   const message=cause instanceof Error?cause.message:'Photo could not be uploaded. Please retry.';
   setPhotoStatus(linked?'Saved to your account, but final verification needs a refresh.':'Photo upload was not completed.');
   setError(message);
   // The editor stays open on a failed pre-link upload, so cropping is not lost.
   if(linked){setPhoto(null);window.dispatchEvent(new CustomEvent('dli-profile-changed'));}
   throw new Error(message);
  }finally{setBusy(false);}
 }

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!supabase||busy||!userId||!account)return;
  const clean=name.trim(),dob=validBirthDate(birthYear,birthMonth,birthDay);
  if(clean.length<2||clean.length>160||!dob){
    setError('Enter your name and a valid date of birth.');return;
  }
  if(!profile){setError('Choose a photo, crop it and click Upload photo before saving your profile details.');return;}
  setBusy(true);setError(null);setNotice(null);
  try{
   const result=await supabase.from('dli_member_profiles')
     .update({personal_name:clean,date_of_birth:dob,preferred_theme:theme})
     .eq('user_id',userId).select('user_id').maybeSingle();
   if(result.error||!result.data){
     setError('Profile details were not saved. Please retry.');return;
   }
   setNotice('Your personal details and display preference were saved.');
   window.dispatchEvent(new CustomEvent('dli-profile-changed'));
   await refresh();
  }catch{setError('Profile update could not be confirmed. Refresh before retrying.');}
  finally{setBusy(false);}
 }
 const themeOptions=[['system','Follow my device'],['light','Light mode'],['dark','Dark mode']] as const;
 return <div className="module-page member-profile-page">
  <div className="module-page-hero"><span className="module-page-icon"><UserRound size={25}/></span>
   <div className="module-page-copy"><div className="eyebrow"><span className="eyebrow-line"/> MY ACCOUNT</div>
    <h1>My profile &amp; preferences</h1>
    <p>Manage your profile and appearance preferences.</p>
   </div></div>
  <button type="button" className="dli-tour-launch" onClick={()=>window.dispatchEvent(new Event('dli-tour-replay'))}>
    <HelpCircle size={17} aria-hidden="true"/> Replay guided app tour
  </button>
  <div className="module-notice"><div className="notice-icon"><ShieldCheck size={18}/></div><div>
    <strong>Protected account and profile details</strong>
    <p>Only you can edit your personal details or upload a new photo. Your saved photo may appear to
      authorised DLI chat contacts, while opening another member's profile requires approved role and
      active-class permissions. Your registered email and institutional role cannot be edited here.
      For corrections to your institutional identity, contact DLI administration.</p>
   </div></div>
  {error&&<p className="auth-feedback error" role="alert">{error}</p>}
  {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
  {notice&&<p><Link className="user-outline-button" to="/">Open my DLI dashboard</Link></p>}
  <section className="panel member-profile-main">
   <div data-dli-tour="profile" className="panel-heading"><div><p className="section-kicker">PERSONAL DETAILS</p>
    <h2>{profile?'Your saved profile':'Complete your profile'}</h2>
    <p className="user-caption">Choose a picture, adjust the crop, then select Upload photo. The photo is saved to your private DLI cloud storage and remains available across devices. Saving other profile details is a separate action.</p>
   </div><button type="button" className="user-outline-button" onClick={()=>void refresh()} disabled={loading||busy}><RefreshCw size={15}/> Refresh</button></div>
   <form className="member-profile-form" onSubmit={e=>void save(e)}>
    <div className="member-profile-photo">
      {picture?<img src={picture} alt="Your saved private profile photo"/>:<span><UserRound size={32}/></span>}
      <div className="member-profile-photo-chooser">
        <label htmlFor="member-photo"><Camera size={16}/> Profile picture {profile?'(change optional)':'(required for first login)'}</label>
        <input id="member-photo" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={busy||loading}
          onChange={event=>{
           const selected=event.currentTarget.files?.[0]??null;
           event.currentTarget.value='';
           setNotice(null);setError(null);setPhotoStatus(null);
           if(!selected){return;}
           if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||!selected.size||selected.size>2*1024*1024){
             setPhoto(null);setError('Choose a JPEG, PNG or WEBP image no larger than 2 MB.');return;
           }
           setPhoto(selected);
          }}/>
        <small>JPEG, PNG or WEBP, maximum 2 MB. After choosing a file, crop it below and click Upload photo.</small>
        <span className="member-photo-cloud-state" aria-live="polite">
          {photoStatus??(picture?'Saved photo is available in your DLI cloud account.':'No saved photo could be displayed.')}
        </span>
      </div>
    </div>
    {photo&&<ProfilePhotoEditor file={photo} disabled={busy||loading}
      onCancel={()=>{setPhoto(null);setPhotoStatus(null);}}
      onUpload={uploadPhoto}/>}
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
    <button type="submit" className="academic-submit" disabled={loading||busy||!profile}>
      <Save size={16}/>{busy?'Saving profile…':'Save personal details'}
    </button>
   </form>
  </section>
  <RoleProfileFields/>
  <AppearancePreferences/>
  <BrowserAlertPermission/>
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
