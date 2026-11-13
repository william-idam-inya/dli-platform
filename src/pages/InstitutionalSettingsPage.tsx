import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  BookOpen, CalendarClock, CheckCircle2, ExternalLink,
  LockKeyhole, RefreshCw, Save, Settings2, ShieldCheck, Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './InstitutionalSettingsPage.css';

type SettingKey = 'dli_scholars_students' | 'dli_scholars_tutors';
type GroupSetting = {
  setting_key: SettingKey;
  display_label: string;
  invite_url: string | null;
  updated_at: string;
};
const SETTINGS: {key: SettingKey;label:string;description:string;icon:typeof BookOpen}[] = [
  {
    key:'dli_scholars_students',label:'DLI–Scholars Club · Students',
    description:'Group invitation for the DLI–Scholars Club student community. Does not assign a learner to a class.',
    icon:Users,
  },
  {
    key:'dli_scholars_tutors',label:'DLI–Scholars Club · Tutors',
    description:'Separate invitation for the DLI–Scholars Club tutor community. Does not grant institutional staff access.',
    icon:BookOpen,
  },
];
const EMPTY: Record<SettingKey,string> = {
  dli_scholars_students:'',dli_scholars_tutors:'',
};
const WHATSAPP_INVITE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+(?:\?[A-Za-z0-9_=&%.-]+)?$/;
const WAT = new Intl.DateTimeFormat('en-NG',{
  timeZone:'Africa/Lagos',year:'numeric',month:'short',day:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:true,
});
function updatedLabel(value:string):string{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Date unavailable':WAT.format(date)+' WAT';
}

export default function InstitutionalSettingsPage(){
  const {account}=useAuth();
  const isFounder=account?.role==='owner';
  const mayViewGroupLinks=account?.role==='owner'||account?.role==='admin';
  const canView=mayViewGroupLinks||account?.role==='assistant_admin';
  const [links,setLinks]=useState<GroupSetting[]>([]);
  const [inputs,setInputs]=useState<Record<SettingKey,string>>(EMPTY);
  const [noticesAvailable,setNoticesAvailable]=useState<boolean|null>(null);
  const [enrolmentOpen,setEnrolmentOpen]=useState<boolean|null>(null);
  const [enrolmentSaving,setEnrolmentSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState<SettingKey|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    const client=supabase;
    if(!client||!canView){
      setLinks([]);setNoticesAvailable(null);
      setError('Institutional settings are unavailable for this account.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotice(null);
    try{
      const [groupResult,noticeResult,enrolmentResult]=await Promise.all([
        mayViewGroupLinks?client.from('institutional_group_links')
          .select('setting_key,display_label,invite_url,updated_at')
          .order('setting_key'):Promise.resolve({data:[] as GroupSetting[],error:null}),
        // M1's active DLI broadcasts use dli_notices. The earlier H5
        // communication_feature_flags switch belongs to a different legacy
        // announcement table and MUST NOT mislabel this feature as disabled.
        client.from('dli_notices').select('id',{count:'exact',head:true}),
        client.from('dli_operational_controls').select('is_enabled').eq('setting_key','paid_enrolment_open').maybeSingle(),
      ]);
      if(groupResult.error){
        setLinks([]);setError('Could not load institutional group settings. Refresh or check your account permissions.');
      }else{
        const records=(groupResult.data??[]) as GroupSetting[];
        setLinks(records);
        const values:Record<SettingKey,string>={...EMPTY};
        for(const record of records){
          if(record.setting_key in values)values[record.setting_key]=record.invite_url??'';
        }
        setInputs(values);setError(null);
      }
      setNoticesAvailable(noticeResult.error?null:true);
      setEnrolmentOpen(enrolmentResult.error||!enrolmentResult.data?null:Boolean(enrolmentResult.data.is_enabled));
    }catch{
      setLinks([]);setNoticesAvailable(null);setEnrolmentOpen(null);
      setError('Unable to reach Supabase. Governance status cannot be verified.');
    }finally{setLoading(false);}
  },[canView,mayViewGroupLinks]);

  useEffect(()=>{void refresh();},[refresh]);

  async function save(event:FormEvent<HTMLFormElement>,key:SettingKey){
    event.preventDefault();
    const client=supabase;
    if(!client||!isFounder||saving||loading)return;
    const clean=inputs[key].trim();
    if(clean&&(clean.length>512||!WHATSAPP_INVITE.test(clean))){
      setError('Enter a valid https://chat.whatsapp.com/ invitation URL, or leave the field empty to clear it.');
      setNotice(null);
      return;
    }
    const current=links.find(x=>x.setting_key===key);
    if(!current){setError('Setting record not found. Refresh before saving.');return;}
    if((current.invite_url??'')===clean){
      setNotice('No changes to save.');setError(null);return;
    }
    if(!clean&&!window.confirm('Clear the saved group invitation link? This will not revoke invitations already shared outside DLI.'))return;
    setSaving(key);setError(null);setNotice(null);
    try{
      const {data, error:writeError}=await client.from('institutional_group_links')
        .update({invite_url:clean||null})
        .eq('setting_key',key)
        .select('setting_key,display_label,invite_url,updated_at')
        .maybeSingle();
      if(writeError||!data){
        setError('The change was not saved. Only the active Founder may edit group invitations.');
        return;
      }
      setLinks(previous=>previous.map(x=>x.setting_key===key?(data as GroupSetting):x));
      setInputs(previous=>({...previous,[key]:data.invite_url??''}));
      setNotice(clean
        ?'Group invitation saved to the private institutional settings register. No invitation was sent.'
        :'Group invitation cleared from the institutional settings register.');
    }catch{
      setError('Could not contact the database. No update has been verified.');
    }finally{setSaving(null);}
  }

  async function changeEnrolmentStatus(){
    if(!supabase||!canView||enrolmentSaving||enrolmentOpen===null)return;
    const next=!enrolmentOpen;
    if(!window.confirm(next
      ?'Reopen new Paid Student applications? Existing approved payments remain unchanged.'
      :'Pause NEW Paid Student applications? Existing applications remain available for review.'))return;
    setEnrolmentSaving(true);setError(null);setNotice(null);
    try{
      const result=await supabase.from('dli_operational_controls')
        .update({is_enabled:next}).eq('setting_key','paid_enrolment_open')
        .select('is_enabled').maybeSingle();
      if(result.error||!result.data){
        setError('Could not confirm this admission setting. Refresh before trying again.');return;
      }
      setEnrolmentOpen(Boolean(result.data.is_enabled));
      setNotice(next?'New paid enrolment applications are open.':'New applications paused; existing requests can still be reviewed.');
    }catch{setError('The admission-setting change could not be verified.');}
    finally{setEnrolmentSaving(false);}
  }

  const configuredCount=links.filter(item=>item.invite_url!==null).length;
  const publicationStatus=noticesAvailable===null?'Verification unavailable':'Available';

  return <div className="module-page institutional-settings-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><Settings2 size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> INSTITUTIONAL GOVERNANCE</div>
        <h1>Institutional settings</h1>
        <p>Live admission controls, role-scoped group invitations and release safeguards.</p>
      </div>
      <span className="module-status"><span/> Stage I3</span>
    </div>

    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div>
        <strong>Only the Founder can change institutional group links</strong>
        <p>The Admin may inspect existing configuration without changing it. Assistant Admin can inspect read-only release safeguards, but not private group invitations.
          Links are kept in PostgreSQL under role-based access policies.
          Saving a group invitation does not invite or enrol anyone,
          publish announcements, authorise fees or send a message.</p>
      </div>
    </div>
    {error&&<p className="auth-feedback error" role="alert">{error}</p>}
    {notice&&<p className="auth-feedback success" role="status">{notice}</p>}

    <div className="institutional-settings-summary">
      {mayViewGroupLinks&&<div><Users size={20}/><strong>{loading?'…':configuredCount}</strong>
        <span>Group invitations configured</span></div>}
      <div><LockKeyhole size={20}/>
        <strong>{account?.role==='owner'?'Founder':account?.role==='assistant_admin'?'Assistant Admin':'Admin'}</strong>
        <span>Your setting access</span></div>
      <div><CalendarClock size={20}/>
        <strong>{publicationStatus}</strong>
        <span>Current DLI notice centre</span></div>
    </div>

    <div className="institutional-settings-actions">
      <p>Institutional links are not publicly exposed here. Settings shown depend on your authorised DLI role.</p>
      <button type="button" className="user-outline-button"
        disabled={loading||saving!==null}
        onClick={()=>{void refresh();}}><RefreshCw size={16}/> Refresh settings</button>
    </div>

    {mayViewGroupLinks&&<section className="panel institutional-settings-links">
      <div className="panel-heading">
        <div><p className="section-kicker">01 · OWNER-CONTROLLED LINKS</p>
          <h2>DLI–Scholars Club group invitations</h2>
          <p className="user-caption">Approved invitations may be entered by the Founder.
            Blank means no invitation is configured; no previously shared
            links are automatically changed.</p>
        </div>
      </div>
      {SETTINGS.map(item=>{
        const record=links.find(x=>x.setting_key===item.key);
        const Icon=item.icon;
        return <form className="institutional-settings-link" key={item.key}
          onSubmit={event=>{void save(event,item.key);}}>
          <div className="institutional-settings-link-heading">
            <span className="institutional-settings-link-icon"><Icon size={20}/></span>
            <div><h3>{item.label}</h3><p>{item.description}</p></div>
            <span className={record?.invite_url?'institutional-status configured':'institutional-status'}>
              {record?.invite_url?<><CheckCircle2 size={13}/> Configured</>:'Unconfigured'}
            </span>
          </div>
          <label htmlFor={item.key}>WhatsApp invitation URL</label>
          <input id={item.key} type="url" value={inputs[item.key]}
            autoComplete="off" spellCheck={false}
            maxLength={512}
            placeholder={isFounder?'https://chat.whatsapp.com/…':'Not configured'}
            disabled={!isFounder||loading||saving!==null||!record}
            onChange={event=>setInputs(previous=>({...previous,[item.key]:event.target.value}))}/>
          <div className="institutional-settings-link-bottom">
            <small>{record?'Last recorded: '+updatedLabel(record.updated_at):
              loading?'Checking…':'Setting unavailable'}</small>
            {isFounder&&<button type="submit" className="academic-submit"
              disabled={loading||saving!==null||!record}>
              <Save size={15}/>{saving===item.key?'Saving…':'Save invitation'}</button>}
          </div>
        </form>;
      })}
      {!isFounder&&<p className="institutional-settings-readonly">
        <LockKeyhole size={15}/> Your Admin account has read-only access.
        A separate Founder account must configure or clear these links.</p>}
    </section>}

    <section className="panel institutional-settings-governance">
      <div className="panel-heading"><div>
        <p className="section-kicker">02 · LIVE OPERATIONAL CONTROL</p>
        <h2>Paid Student application window</h2>
        <p className="user-caption">Founder, Admin and Assistant Admin may pause or resume NEW paid-enrolment applications.
          Existing submitted applications and previously approved students are not cancelled.</p>
      </div></div>
      <div className="institutional-settings-safeguards">
        <div><strong>New applications</strong>
          <span>{enrolmentOpen===null?'Verification unavailable':enrolmentOpen?'Open':'Paused'}</span>
          <p>This is enforced when a learner submits an application in the database, not just in the browser.</p>
          <button type="button" className="user-outline-button"
            disabled={loading||enrolmentSaving||enrolmentOpen===null}
            onClick={()=>{void changeEnrolmentStatus();}}>
            {enrolmentSaving?'Saving…':enrolmentOpen?'Pause new applications':'Reopen applications'}
          </button>
        </div>
      </div>
    </section>

    <section className="panel institutional-settings-governance">
      <div className="panel-heading"><div>
        <p className="section-kicker">03 · RELEASE SAFEGUARDS</p>
        <h2>Existing governance restrictions</h2>
        <p className="user-caption">Information only. This stage does not provide controls
          to lift these restrictions.</p>
      </div></div>
      <div className="institutional-settings-safeguards">
        <div>
          <strong>Current in-app notices</strong>
          <span>{publicationStatus}</span>
          <p>The current notice centre is backed by the role-scoped dli_notices
            table, including manual activation, scheduling and withdrawal.
            This is separate from the retired H5 publication flag, which
            must not be presented as the status of current notices.
            {' '}<Link to="/announcements">Open announcement centre</Link>.
          </p>
        </div>
        <div><strong>Finance rates and payments</strong><span>Not configured here</span>
          <p>Financial policies remain subject to separate institutional approval.
            No invoice, collection or payout feature is enabled by I3.</p></div>
        <div><strong>AI authoring integration</strong><span>Not connected here</span>
          <p>Stage I3 does not connect an AI API, submit learner data or
            change the existing Gemini compliance requirement.</p></div>
        <div><strong>Reporting exports</strong><span>Aggregate CSV available</span>
          <p>Authorised staff can export verified non-identifying counts in
            {' '}<Link to="/reports">Operational reports</Link>.
            User-directory, payment evidence and raw audit exports remain restricted.</p></div>
      </div>
    </section>
    <p className="module-footnote"><ExternalLink size={15}/>
      Group invitation links are private institutional configuration,
      not proof that a message was delivered or a learner joined.
      Other settings, such as the academic calendar, exchange rates,
      compensation and billing, require separate requirements and approval.
    </p>
  </div>;
}
